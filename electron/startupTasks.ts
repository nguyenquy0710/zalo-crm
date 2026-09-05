import { safeStorage } from 'electron';
import DatabaseService from '../src/services/database/DatabaseService';
import WorkspaceManager from '../src/utils/WorkspaceManager';
import HttpConnectionManager from '../src/services/http/HttpConnectionManager';

/**
 * Non-UI startup logic shared giữa main.ts (desktop Electron) và server.ts (headless/Docker).
 * Tách ra file riêng để cả hai entrypoint gọi chung một chỗ, không copy-paste hai bản dễ lệch nhau.
 */

/**
 * Decrypt cookies from DB — mirror of DatabaseService.decryptCookies().
 * startupAllWorkspaces reads raw rows via queryOtherDb, so we must decrypt
 * before passing to loginService.connectUser().
 */
export function decryptCookiesForStartup(encrypted: string): string {
  if (!encrypted) return encrypted;
  const trimmed = encrypted.trimStart();
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) return encrypted;
  if (/^\d+:[A-Za-z0-9_-]+$/.test(trimmed)) return encrypted;

  // Try safeStorage — works for any encrypted format (DPAPI, U2Fsd, etc.)
  // GramJS sessions are NOT encrypted → safeStorage.decryptString throws → return as-is
  try {
    if (safeStorage.isEncryptionAvailable()) {
      const decrypted = safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
      if (decrypted.startsWith('[') || decrypted.startsWith('{')) {
        JSON.parse(decrypted); // validate
        return decrypted;
      }
      return decrypted;
    }
  } catch {
    // safeStorage failed → likely GramJS session or corrupted data → return as-is
  }
  return encrypted;
}

/**
 * Ordered startup: scan all workspaces, start relays + connect Zalo for local workspaces FIRST,
 * THEN connect remote/employee workspaces. Ensures Boss is ready before employees connect.
 */
export async function startupAllWorkspaces(): Promise<void> {
  const wsMgr = WorkspaceManager.getInstance();
  const db = DatabaseService.getInstance();
  const allWorkspaces = wsMgr.listWorkspaces();
  const localWorkspaces = allWorkspaces.filter(w => w.type === 'local');
  const remoteWorkspaces = allWorkspaces.filter(w => w.type === 'remote' && w.autoConnect);

  // ── Phase 1: Start relay servers for ALL local workspaces with relayAutoStart ──
  for (const ws of localWorkspaces) {
    if (!ws.relayAutoStart) continue;
    try {
      const HttpRelayService = (await import('../src/services/http/HttpRelayService')).default;
      const relay = HttpRelayService.getInstance();
      const port = ws.relayPort || 9900;
      const res = await relay.start(port); // start() is idempotent - skips if already running
      if (res?.success) {
        console.log(`[startupAllWorkspaces] Relay started on port ${res.port} for workspace "${ws.name}"`);
      }
    } catch (err: any) {
      console.error(`[startupAllWorkspaces] Relay start failed for "${ws.name}":`, err.message);
    }
  }

  // ── Phase 2: Auto-connect Zalo accounts for ALL local workspaces ──
  const LoginService = (await import('../src/services/login/LoginService')).default;
  const loginService = new LoginService();
  const connectedZaloIds = new Set<string>();

  for (const ws of localWorkspaces) {
    try {
      const dbPath = wsMgr.resolveDbPath(ws.dbPath || 'zalocrm-tool.db');
      if (!dbPath || !require('fs').existsSync(dbPath)) continue;

      // Read accounts from this workspace's DB (without switching active DB)
      const accounts = db.queryOtherDb<any[]>(dbPath, (otherDb) => {
        const rows = otherDb.prepare("SELECT * FROM accounts WHERE is_active = 1 AND (channel = 'zalo' OR channel IS NULL)").all();
        return rows;
      });

      for (const acc of accounts) {
        if (connectedZaloIds.has(acc.zalo_id)) continue; // already connected
        try {
          const decryptedCookies = decryptCookiesForStartup(acc.cookies || '');
          console.log(`[startupAllWorkspaces] ${acc.zalo_id}: raw prefix="${(acc.cookies || '').substring(0, 20)}" → decrypted prefix="${decryptedCookies.substring(0, 40)}" len=${decryptedCookies.length}`);
          await loginService.connectUser({
            cookies: decryptedCookies,
            imei: acc.imei || '',
            userAgent: acc.user_agent || acc.userAgent || '',
          });
          connectedZaloIds.add(acc.zalo_id);
          console.log(`[startupAllWorkspaces] Connected Zalo ${acc.zalo_id} from workspace "${ws.name}"`);
        } catch (err: any) {
          console.warn(`[startupAllWorkspaces] Failed to connect ${acc.zalo_id} from "${ws.name}":`, err.message);
        }
      }
    } catch (err: any) {
      console.warn(`[startupAllWorkspaces] Failed to load accounts from "${ws.name}":`, err.message);
    }
  }

  // ── Phase 3: Connect remote/employee workspaces (Boss must be ready first) ──
  if (remoteWorkspaces.length > 0) {
    console.log(`[startupAllWorkspaces] Connecting ${remoteWorkspaces.length} remote workspace(s)...`);
    await HttpConnectionManager.getInstance().connectAutoWorkspaces();
  }
  HttpConnectionManager.getInstance().startHealthCheck(60_000);
}

/**
 * Auto-reconnect tất cả Telegram accounts khi app khởi động.
 * Tương tự reconnectAllFBAccounts nhưng cho Telegram Bot + User.
 */
export async function reconnectAllTelegramAccounts(): Promise<void> {
  try {
    const db = DatabaseService.getInstance();
    if (!db) return;

    const accounts = db.getAccounts();
    const telegramAccounts = accounts.filter((a: any) => {
      const ch = a.channel || 'zalo';
      return (ch === 'telegram_bot' || ch === 'telegram_user') && a.is_active;
    });

    if (telegramAccounts.length === 0) return;

    console.log(`[startupTasks] Auto-reconnecting ${telegramAccounts.length} Telegram account(s)...`);

    for (const acc of telegramAccounts) {
      const channel = acc.channel || 'zalo';
      try {
        if (channel === 'telegram_bot') {
          const { startBot } = require('../src/services/telegram/TelegramBotChannelService');
          startBot({
            accountId: acc.zalo_id,
            botToken: acc.cookies || '',
            botUsername: (acc as any).username || '',
            botFirstName: acc.full_name || '',
          });
          console.log(`[startupTasks] Telegram Bot ${acc.zalo_id} polling started`);
        } else if (channel === 'telegram_user') {
          const stringSession = acc.cookies || '';
          if (!stringSession) {
            console.warn(`[startupTasks] Telegram User ${acc.zalo_id} has no session - skipping`);
            continue;
          }
          // Kiểm tra session hợp lệ (GramJS session là base64 decode thành JSON)
          // Nếu session bắt đầu bằng "U2Fsd" = encrypted blob chưa decrypt được → skip
          if (stringSession.trimStart().startsWith('U2Fsd')) {
            console.warn(`[startupTasks] Telegram User ${acc.zalo_id} session is encrypted blob (decrypt failed) - needs re-login`);
            continue;
          }
          const { startListener } = require('../src/services/telegram/TelegramUserListener');
          const result = await startListener({
            accountId: acc.zalo_id,
            phoneNumber: acc.phone || '',
            stringSession,
          });
          if (result?.success) {
            console.log(`[startupTasks] Telegram User ${acc.zalo_id} listener started`);
          } else {
            console.warn(`[startupTasks] Telegram User ${acc.zalo_id} failed: ${result?.error}`);
          }
        }
      } catch (err: any) {
        console.warn(`[startupTasks] Failed to reconnect Telegram ${acc.zalo_id}: ${err.message}`);
      }
    }
  } catch (err: any) {
    console.error('[startupTasks] reconnectAllTelegramAccounts error:', err.message);
  }
}

/**
 * Periodic health check for Telegram bots.
 * Checks if registered bots are still polling; reconnects if not.
 * Runs every 60 seconds.
 */
export function startTelegramBotHealthCheck(): void {
  setInterval(() => {
    try {
      const { isBotPolling, tryReconnectBot, getActiveBots } = require('../src/services/telegram/TelegramBotChannelService');
      const activeBots = getActiveBots();
      for (const bot of activeBots) {
        if (!isBotPolling(bot.accountId)) {
          console.log(`[startupTasks] Telegram Bot ${bot.accountId} not polling — attempting reconnect`);
          tryReconnectBot(bot.accountId);
        }
      }
    } catch {}
  }, 60_000);
}
