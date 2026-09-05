'use strict';
/**
 * resolveElectronShim.js — nạp bằng `node --require` TRƯỚC KHI server.js chạy.
 * Chặn Module._resolveFilename để mọi `require('electron')`/`import ... from 'electron'`
 * (đã compile ra require('electron')) trong toàn bộ project trỏ tới electronShim.js
 * thay vì gói electron thật — nhờ vậy electron/ipc/*.ts, DatabaseService.ts,
 * FileStorageService.ts... chạy KHÔNG SỬA GÌ dưới Node thuần.
 *
 * Chỉ dùng cho electron/server.ts (headless/Docker). electron/main.ts (desktop) khởi
 * chạy trực tiếp bằng electron binary thật, không đi qua file này.
 */
const Module = require('module');
const path = require('path');

const shimPath = path.join(__dirname, 'electronShim.js');
const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function (request, ...rest) {
  if (request === 'electron') return shimPath;
  return originalResolveFilename.call(this, request, ...rest);
};
