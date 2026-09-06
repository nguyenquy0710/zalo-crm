/**
 * server.ts — entrypoint headless cho triển khai Docker/web (KHÔNG dùng Electron thật).
 *
 * Chạy dưới Node thuần, `require('electron')` được electron/headless-shim/resolveElectronShim.js
 * (nạp qua `node --require`) trỏ sang electronShim.js — nhờ vậy toàn bộ business logic hiện có
 * (DatabaseService, các electron/ipc/*.ts, FileStorageService...) dùng lại NGUYÊN VẸN, không sửa gì.
 *
 * Khác với electron/main.ts (desktop): không tạo BrowserWindow/Tray/protocol/deep-link/auto-update —
 * những thứ đó chỉ có ý nghĩa khi có UI Electron thật. server.ts chỉ khởi tạo DB + đăng ký IPC handler
 * (để populate ipcHandlerRegistry mà HttpRelayService dùng) + các background service (relay, workflow,
 * CRM queue, ERP scheduler, webhook gateway, auto-reconnect kênh...) — đúng phần "backend" của app.
 */
import * as cron from 'node-cron';
import DatabaseService from '../src/services/database/DatabaseService';
import { registerLoginIpc } from './ipc/loginIpc';
import { registerZaloIpc } from './ipc/zaloIpc';
import { registerDatabaseIpc } from './ipc/databaseIpc';
import { registerFileIpc } from './ipc/fileIpc';
import { registerCRMIpc } from './ipc/crmIpc';
import { registerWorkflowIpc } from './ipc/workflowIpc';
import { registerIntegrationIpc } from './ipc/integrationIpc';
import { registerAIAssistantIpc } from './ipc/aiAssistantIpc';
import { registerUtilIpc } from './ipc/utilIpc';
import { registerEmployeeIpc } from './ipc/employeeIpc';
import { registerRelayIpc } from './ipc/relayIpc';
import { registerWorkspaceIpc } from './ipc/workspaceIpc';
import { registerFacebookIpc, reconnectAllFBAccounts } from './ipc/facebookIpc';
import { registerTelegramIpc } from './ipc/telegramIpc';
import { registerTelegramUserIpc } from './ipc/telegramUserIpc';
import { registerProxyIpc } from './ipc/proxyIpc';
import { registerErpTaskIpc } from './ipc/erpTaskIpc';
import { registerErpCalendarIpc } from './ipc/erpCalendarIpc';
import { registerErpNoteIpc } from './ipc/erpNoteIpc';
import { registerErpNotificationIpc } from './ipc/erpNotificationIpc';
import { registerErpHrmIpc } from './ipc/erpHrmIpc';
import { registerLockScreenIpc } from './ipc/lockScreenIpc';
import { registerLibraryIpc } from './ipc/libraryIpc';
import WorkspaceManager from '../src/utils/WorkspaceManager';
import HttpConnectionManager from '../src/services/http/HttpConnectionManager';
import HttpRelayService from '../src/services/http/HttpRelayService';
import WorkflowEngineService from '../src/services/workflow/WorkflowEngineService';
import WebhookGatewayService from '../src/services/workflow/WebhookGatewayService';
import IntegrationRegistry from '../src/services/integrations/IntegrationRegistry';
import EventBroadcaster from '../src/services/event/EventBroadcaster';
import CRMQueueService from '../src/services/crm/CRMQueueService';
import TrackingService from '../src/services/tracking/TrackingService';
import {
  startupAllWorkspaces,
  reconnectAllTelegramAccounts,
  startTelegramBotHealthCheck,
} from './startupTasks';

async function main(): Promise<void> {
  WorkspaceManager.getInstance().initialize();
  await DatabaseService.getInstance().initialize();

  setTimeout(() => {
    try {
      const migrated = DatabaseService.getInstance().migrateAllAbsolutePathsToRelative();
      if (migrated > 0) {
        DatabaseService.getInstance().forceFlush();
        console.log(`[server] Startup migration: converted ${migrated} message(s) to relative paths`);
      }
    } catch (e: any) {
      console.warn(`[server] Startup path migration failed: ${e.message}`);
    }
  }, 2000);

  // Đăng ký toàn bộ IPC handler — populate ipcHandlerRegistry (HttpRelayService đọc từ đây,
  // không phải từ ipcMain thật). Không có mainWindow trong headless → truyền null.
  registerLoginIpc(null);
  registerZaloIpc();
  registerDatabaseIpc();
  registerFileIpc();
  registerCRMIpc();
  registerWorkflowIpc();
  registerIntegrationIpc();
  registerAIAssistantIpc();
  registerUtilIpc();
  registerEmployeeIpc();
  registerRelayIpc();
  registerWorkspaceIpc(null);
  registerFacebookIpc();
  registerTelegramIpc();
  registerTelegramUserIpc();
  registerProxyIpc();
  registerErpTaskIpc();
  registerErpCalendarIpc();
  registerErpNoteIpc();
  registerErpNotificationIpc();
  registerErpHrmIpc();
  registerLockScreenIpc();
  registerLibraryIpc();

  reconnectAllFBAccounts().catch((err: any) => console.error('[server] reconnectAllFBAccounts error:', err.message));
  reconnectAllTelegramAccounts().catch((err: any) => console.error('[server] reconnectAllTelegramAccounts error:', err.message));
  startTelegramBotHealthCheck();

  // startupAllWorkspaces() chỉ start HttpRelayService cho workspace có relayAutoStart=true
  // (cờ desktop, người dùng tự bật trong Settings) - workspace mặc định tạo bởi
  // WorkspaceManager.migrateFromLegacy() không set cờ này nên relay sẽ không bao giờ start.
  // Ở headless không có UI Settings nào để bật cờ, và relay (REST + Socket.IO) chính là
  // API duy nhất để tương tác với server này, nên phải start vô điều kiện (start() đã
  // idempotent - nếu startupAllWorkspaces cũng start được thì gọi thêm lần nữa vẫn an toàn).
  HttpRelayService.getInstance().start().then((res) => {
    if (res.success) console.log(`[server] HttpRelayService started on port ${res.port}`);
    else console.error('[server] HttpRelayService start failed:', res.error);
  });

  setTimeout(() => startupAllWorkspaces().catch((err: any) => {
    console.error('[server] startupAllWorkspaces error:', err.message);
  }), 3000);
  setTimeout(() => CRMQueueService.getInstance().resumeActiveCampaigns(), 3000);
  setTimeout(() => {
    try {
      const ErpCalendarService = require('../src/services/erp/ErpCalendarService').default;
      ErpCalendarService.getInstance().initSchedulers();
    } catch (err: any) { console.error('[server] ErpCalendar scheduler init error:', err.message); }
  }, 3500);
  setTimeout(() => {
    try {
      const ErpNotificationService = require('../src/services/erp/ErpNotificationService').default;
      ErpNotificationService.getInstance().startSchedulers();
    } catch (err: any) { console.error('[server] ErpNotification scheduler init error:', err.message); }
  }, 3700);
  setTimeout(() => WorkflowEngineService.getInstance().initialize(), 2000);
  setTimeout(() => {
    IntegrationRegistry.initialize();
    EventBroadcaster.onBeforeSend('integration:payment', (data: any) => {
      WorkflowEngineService.getInstance()['triggerWorkflows']('trigger.payment', data);
    });
  }, 2500);
  setTimeout(() => {
    WebhookGatewayService.getInstance().start().then((result) => {
      if (result.success) console.log('[server] WebhookGateway started on port ' + result.port);
    });
  }, 3000);
  setTimeout(() => {
    try {
      TrackingService.getInstance().start();
    } catch (err: any) {
      console.error('[server] TrackingService init error:', err.message);
    }
  }, 5000);

  // Media cleanup: mỗi ngày 3:00 sáng — mirror main.ts's mediaCleanupJob
  cron.schedule('0 3 * * *', async () => {
    console.log('[MediaCleanup] Running daily scheduled cleanup...');
    try {
      const FileStorageService = require('../src/services/file/FileStorageService').default;
      const db = DatabaseService.getInstance();
      const accounts = db.getAccounts();
      for (const acc of accounts) {
        const config = db.getMediaAutoDeleteConfig(acc.zalo_id);
        if (config?.enabled && config.days > 0) {
          const deleted = FileStorageService.cleanupOldMedia(acc.zalo_id, config.days);
          if (deleted > 0) console.log(`[MediaCleanup] Cleaned ${deleted} dirs for ${acc.zalo_id}`);
        }
      }
      console.log('[MediaCleanup] Daily cleanup completed');
    } catch (err: any) {
      console.error('[MediaCleanup] Error:', err.message);
    }
  });
  console.log('[MediaCleanup] Scheduler initialized - runs daily at 3:00 AM');

  console.log('[server] ZaloCRM headless server ready.');
}

function shutdown(): void {
  console.log('[server] Shutting down...');
  try {
    const crmTimers = CRMQueueService.getInstance() as any;
    if (crmTimers?.timers) {
      for (const [, timer] of crmTimers.timers) clearInterval(timer);
      crmTimers.timers.clear();
    }
  } catch {}
  try {
    const wfe = WorkflowEngineService.getInstance() as any;
    if (wfe?.cronJobs) {
      for (const [, job] of wfe.cronJobs) { try { job.stop(); } catch {} }
      wfe.cronJobs.clear();
    }
  } catch {}
  try { IntegrationRegistry.stopWebhookServer(); } catch {}
  try { WebhookGatewayService.getInstance().stop(); } catch {}
  try { DatabaseService.getInstance().close(); } catch {}
  try { HttpConnectionManager.getInstance().disconnectAll(); } catch {}
  try {
    const { stopAllBots } = require('../src/services/telegram/TelegramBotChannelService');
    stopAllBots();
  } catch {}
  try {
    const { stopAllListeners } = require('../src/services/telegram/TelegramUserListener');
    stopAllListeners();
  } catch {}
  try {
    const { stopAllPollers } = require('../src/services/workflow/TelegramBotPollingService');
    stopAllPollers();
  } catch {}
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
process.on('uncaughtException', (error) => {
  console.error('[server] Uncaught exception:', error);
});
process.on('unhandledRejection', (reason) => {
  console.error('[server] Unhandled rejection:', reason);
});

main().catch((err) => {
  console.error('[server] Fatal startup error:', err);
  process.exit(1);
});
