# Code rules

Project-specific rules that aren't obvious from reading a single file in isolation. See the per-directory `CLAUDE.md` files for full context; this is the condensed checklist.

## Boundaries

- Never import `src/ui/*` from `src/services/*` or `electron/*` — `tsconfig.electron.json` excludes `src/ui/**` from the main-process build.
- Never call `ipcMain`/`ipcRenderer` from inside `src/services/*` — services must stay usable from both the local Electron IPC path and the Employee-mode REST path (`src/services/http/handlers/*`).
- In `src/ui/`, never call `ipc.db.*` (or other raw `window.electronAPI` methods) directly for data fetching — go through `src/ui/lib/data/DataAccessor.ts` or a channel adapter (`src/ui/lib/channelIpc.ts`), so the code keeps working in Employee/remote mode.

## Secrets

Encrypt secrets via `src/services/secure/SecureSettingsService.ts` (`secureSet`/`secureGet`/`secureDelete`, backed by Electron `safeStorage`). Do not write a new inline `safeStorage` encrypt/decrypt pair — this pattern is already duplicated in `ai/AIAssistantService.ts` and `integrations/IntegrationRegistry.ts`; don't add a fourth copy.

## IPC

- One file per domain under `electron/ipc/`, each exporting `registerXxxIpc()`, called once from `electron/main.ts`.
- Channel names: `domain:resource:action` (e.g. `erp:task:list`).
- New channels must be added to `electron/preload.ts`'s `contextBridge` surface and usually `src/ui/lib/ipc.ts`'s typed façade.
- ERP handlers must use `withErpAuth(...)` + `erpValidate` from `electron/ipc/erpIpcMiddleware.ts` — identity/role is always resolved server-side via `ErpAuthContext`, never trust a renderer-supplied `employeeId`.

## Multi-channel (Zalo/Facebook/Telegram)

- Zalo/Facebook: `class` + `static Map<string, Service>` + `getInstance(accountId)`. Telegram: module-scoped functions + `Map`s. Match whichever sibling you're extending.
- Register new capability flags in `src/configs/channelConfig.ts` (`Channel` type). If the action needs a workflow node, also update `src/services/workflow/WorkflowEngineService.ts`'s separately-maintained `WorkflowChannel` union.
- Add a renderer-side adapter in `src/ui/lib/adapters/` implementing `BaseChannelAdapter` for any new cross-channel UI action.

## Routing

No `react-router-dom` usage despite it being a dependency. New top-level screens extend the `AppView` union in `src/ui/store/appStore.ts` and get wired into `App.tsx`'s conditional render (or dispatched via the `nav:view` CustomEvent) — do not add `<Routes>`/`<Route>`.

## Database

`better-sqlite3`, no ORM, single `DatabaseService` singleton (`src/services/database/DatabaseService.ts`). New persistence code extends its `migrate()` chain and adds typed helper methods on that same class — don't introduce a second DB access layer or a new ORM dependency.

## Outbound messaging

Route CRM/workflow message sends through `src/services/workflow/AccountSendQueue.ts` (per-account promise chain, randomized delay) rather than firing sends directly — it exists to prevent concurrent auto-replies from tripping Zalo's spam detection.
