# CLAUDE.md — electron/

Electron main process. See root [../CLAUDE.md](../CLAUDE.md) first. IPC handler conventions live in [ipc/CLAUDE.md](ipc/CLAUDE.md).

## `main.ts` — what happens where

- Single-instance lock, protocol registration (`local-media://` for local media streaming with HTTP Range support, `deplao://` for deep links like `deplao://openChat?accountId=...`) happen **before** `app.whenReady()`.
- `app.whenReady()` order matters: DB init (`DatabaseService.getInstance().initialize()`) → path migration → window/tray creation → **register every domain's IPC handlers** (flat list of ~19 `registerXxxIpc()` calls — `main.ts` itself is the IPC registry, there's no separate router file) → staggered (`setTimeout`) background service startup: channel auto-reconnect, `startupAllWorkspaces()`, CRM campaign resume, ERP schedulers, Workflow Engine, Integration Registry, Webhook Gateway, Tracking, daily media-cleanup cron.
- `before-quit`/`will-quit` explicitly tear down timers/cron jobs/servers/sockets/DB — this is required, not optional, because those background services would otherwise keep the process alive as an orphaned entry after the window closes.
- Auto-update (`electron-updater`) waits for a renderer-ready IPC signal before the first `checkForUpdates()`; manual controls are `update:check`/`update:download`/`update:install` from the renderer.
- Global `uncaughtException`/`unhandledRejection` handlers only log — the app deliberately does not crash the main process on unexpected errors.
- Renderer crash recovery (`render-process-gone`) retries reload up to 2 times then quits; window `close` hides to tray instead of quitting.

## Security posture

`BrowserWindow.webPreferences`: `contextIsolation: true`, `nodeIntegration: false` — renderer has **no** direct Node/Electron access, only what `preload.ts` exposes via `contextBridge`. Production build adds CSP headers and an anti-debugging check (quits if a debugger is attached via `inspector.url()`). Preserve both when touching window creation.

## `preload.ts`

Mirrors every IPC channel via `contextBridge.exposeInMainWorld('electronAPI', {...})`, namespaced per domain (`zalo`, `fb`, `telegram`, `db`, `erp`, `workflow`, `integration`, `ai`, `employee`, `workspace`, ...) plus `on`/`removeAllListeners` for push events. **Any new IPC channel must be added here too**, and typically also to `src/ui/lib/ipc.ts`'s typed façade — see [ipc/CLAUDE.md](ipc/CLAUDE.md).
