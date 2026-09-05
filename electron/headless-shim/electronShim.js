'use strict';
/**
 * electronShim.js — module giả lập 'electron' để chạy backend headless dưới Node thuần
 * (không có Electron/Xvfb/Chromium thật). Dùng cho triển khai Docker/web (electron/server.ts).
 *
 * Chỉ implement đúng bề mặt API mà electron/**, src/services/**, src/utils/** thực sự
 * dùng (đã grep toàn bộ `from 'electron'` trong project để xác định danh sách này) —
 * KHÔNG cố giả lập toàn bộ Electron. Nạp qua resolveElectronShim.js (Module._resolveFilename
 * hook), không đụng tới app desktop thật (electron/main.ts vẫn chạy Electron thật bình thường).
 */
const crypto = require('crypto');
const path = require('path');

// ─── ipcMain ────────────────────────────────────────────────────────────────
// Mọi registerXxxIpc() gọi ipcMain.handle(channel, fn) NHƯNG cũng tự set fn vào
// ipcHandlerRegistry riêng (electron/ipc/zaloIpc.ts dòng ~174) — HttpRelayService đọc
// từ registry đó, không phải từ ipcMain thật, nên ipcMain ở đây chỉ cần không throw.
const ipcMain = {
  handle: () => {},
  handleOnce: () => {},
  on: () => {},
  once: () => {},
  removeHandler: () => {},
  removeListener: () => {},
  removeAllListeners: () => {},
  _invokeHandlers: new Map(),
};
const ipcRenderer = {
  invoke: async () => { throw new Error('ipcRenderer không khả dụng trong môi trường headless'); },
  send: () => {},
  on: () => () => {},
  removeListener: () => {},
  removeAllListeners: () => {},
};
const contextBridge = { exposeInMainWorld: () => {} };

// ─── app ──────────────────────────────────────────────────────────────────
// userData mặc định /data/.config/ZaloCRM (Docker: mount volume /data, xem Dockerfile).
const userDataDir = process.env.ZALOCRM_USER_DATA_DIR
  || path.join(process.env.HOME || '/data', '.config', 'ZaloCRM');
const appPaths = {
  userData: userDataDir,
  appData: path.dirname(userDataDir),
  temp: process.env.TMPDIR || '/tmp',
  logs: path.join(userDataDir, 'logs'),
  home: process.env.HOME || '/data',
};
const app = {
  getPath: (name) => appPaths[name] || userDataDir,
  getName: () => 'ZaloCRM',
  setName: () => {},
  getVersion: () => process.env.npm_package_version || '0.0.0',
  isPackaged: true,
  whenReady: () => Promise.resolve(),
  on: () => {},
  once: () => {},
  quit: () => process.exit(0),
  exit: (code) => process.exit(code || 0),
  commandLine: { appendSwitch: () => {} },
  setAppUserModelId: () => {},
  setBadgeCount: () => {},
  isDefaultProtocolClient: () => false,
  setAsDefaultProtocolClient: () => {},
  requestSingleInstanceLock: () => true,
  disableHardwareAcceleration: () => {},
  dock: undefined,
};

// ─── safeStorage ────────────────────────────────────────────────────────────
// Container Linux headless không có OS keychain thật (DPAPI/macOS Keychain/libsecret+GUI
// session) → mã hoá AES-256-GCM thật bằng khoá lấy từ biến môi trường ZALOCRM_SECRET_KEY,
// KHÔNG fallback plaintext như SecureSettingsService gốc (đó là fallback cho trường hợp
// hiếm OS không hỗ trợ keychain trên desktop, không phải cho production headless).
const secretKeyEnv = process.env.ZALOCRM_SECRET_KEY || '';
const secretKey = secretKeyEnv ? crypto.createHash('sha256').update(secretKeyEnv).digest() : null;
if (!secretKey) {
  console.warn('[electronShim] ZALOCRM_SECRET_KEY chưa được cấu hình — secureSet/secureGet sẽ lưu plaintext (KHÔNG dùng cho production).');
}
const safeStorage = {
  isEncryptionAvailable: () => !!secretKey,
  encryptString: (plain) => {
    if (!secretKey) throw new Error('ZALOCRM_SECRET_KEY chưa được cấu hình');
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', secretKey, iv);
    const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, enc]);
  },
  decryptString: (buf) => {
    if (!secretKey) throw new Error('ZALOCRM_SECRET_KEY chưa được cấu hình');
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const enc = buf.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', secretKey, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
  },
};

// ─── UI-only stubs (không có màn hình thật trong headless server) ──────────
// EventBroadcaster/HttpConnectionManager chỉ gọi mainWindow.webContents.send(...) —
// server.ts truyền null cho các registerXxxIpc(mainWindow) nên các lớp dưới đây
// trong thực tế không được khởi tạo, giữ lại chỉ để không vỡ nếu có code gọi tới.
class BrowserWindow {
  constructor() {
    this.webContents = {
      send: () => {}, on: () => {}, once: () => {},
      session: { webRequest: { onHeadersReceived: () => {} } },
      openDevTools: () => {}, closeDevTools: () => {},
    };
  }
  loadURL() {} loadFile() {} show() {} hide() {} focus() {} close() {} destroy() {}
  on() {} once() {} isDestroyed() { return false; } isMinimized() { return false; }
  isVisible() { return false; } isMaximized() { return false; } maximize() {} unmaximize() {}
  minimize() {} setIcon() {} setOverlayIcon() {} setAlwaysOnTop() {} flashFrame() {} setTitle() {}
}
class Tray { constructor() {} setToolTip() {} setContextMenu() {} setImage() {} on() {} }
const Menu = { buildFromTemplate: () => ({}) };
const nativeImage = {
  createFromPath: () => ({ isEmpty: () => true, resize: () => ({ isEmpty: () => true }) }),
  createEmpty: () => ({ isEmpty: () => true }),
};
class Notification {
  constructor() {}
  show() {} close() {}
  static isSupported() { return false; }
}
const dialog = {
  showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
  showSaveDialog: async () => ({ canceled: true, filePath: undefined }),
  // DatabaseService dùng khi DB corrupt để hỏi người dùng có muốn xoá & tạo lại không —
  // headless không có ai để hỏi, mặc định chọn nút đầu tiên (thường là "Xoá & tạo lại DB mới")
  // để service tự phục hồi thay vì treo.
  showMessageBoxSync: () => 0,
};
const shell = {
  openExternal: async () => {},
  openPath: async () => '',
  showItemInFolder: () => {},
};
const protocol = { registerSchemesAsPrivileged: () => {}, handle: () => {} };
// Electron's net module ~ fetch-compatible; Node 22 có global fetch sẵn.
const net = { fetch: (...args) => globalThis.fetch(...args), request: undefined };

module.exports = {
  app, ipcMain, ipcRenderer, contextBridge, safeStorage,
  BrowserWindow, Tray, Menu, nativeImage, Notification,
  dialog, shell, protocol, net,
};
