# CLAUDE.md — zalo-crm ("Deplao")

Guidance for AI agents working in this repository. More specific guidance lives in per-directory `CLAUDE.md` files — Claude resolves the most specific one first (see [Scope map](#scope-map)).

## What this product is

**Deplao** — an Electron desktop app for managing multiple **Zalo / Facebook / Telegram** accounts from one place, with built-in **CRM** (campaigns, contacts, tags), a lightweight **ERP** (tasks/calendar/notes/HRM with RBAC), a visual **Workflow** automation builder, and an **AI Assistant** integration. Targets Vietnamese SMB sales/CSKH/marketing teams. Ships for Windows/macOS/Linux via `electron-builder`.

Two related-but-separate repos exist — do not confuse them:
- **This repo** (`zalo-crm`) — the application source code.
- **`babyvibe/deplao-builder`** (external) — where release binaries are actually published (all four CI build workflows push installers there) and where the `landing/` site is deployed via GitHub Pages. `landing/src/constants.ts` download links and the landing page's canonical URL/base path both point at `deplao-builder`, not at this repo or at `deplaoapp.com` directly.

## Scope map

| Path | Covers |
|---|---|
| [src/CLAUDE.md](src/CLAUDE.md) | `src/` overview — layering, path aliases, main/renderer split |
| [src/services/CLAUDE.md](src/services/CLAUDE.md) | Main-process business/domain layer (Zalo/FB/Telegram, CRM, ERP, workflow, DB, events...) |
| [src/ui/CLAUDE.md](src/ui/CLAUDE.md) | React renderer — state, components, hooks, IPC bridge |
| [electron/CLAUDE.md](electron/CLAUDE.md) | Main process entry point, lifecycle, window/tray, auto-update |
| [electron/ipc/CLAUDE.md](electron/ipc/CLAUDE.md) | IPC handler conventions, ERP auth middleware |
| [landing/CLAUDE.md](landing/CLAUDE.md) | Standalone marketing site (separate app, separate deploy) |
| [docs/CLAUDE.md](docs/CLAUDE.md) | Documentation standards, business context |

## Tech stack

- **Runtime**: Electron 41, Node (main process) + Chromium (renderer)
- **Renderer**: React 18 + TypeScript, Vite 6, Tailwind CSS 3, Zustand 5 (no persist/devtools middleware)
- **Main process**: TypeScript compiled via raw `tsc` (not `vite-plugin-electron`, despite it being a devDependency — see [src/CLAUDE.md](src/CLAUDE.md))
- **Persistence**: `better-sqlite3` (synchronous, WAL mode), **no ORM** — one monolithic `DatabaseService` singleton owns all schema/migrations/queries
- **Real-time transport**: Socket.IO (Boss↔Employee push), MQTT (Facebook), custom Electron IPC (renderer↔main)
- **Packaging**: `electron-builder` (nsis/dmg/AppImage/deb)
- **Package manager**: Yarn 4 (`.yarnrc.yml`), though `package-lock.json` also exists — check which one CI actually uses before assuming

## Architecture: main/renderer split

`tsconfig.electron.json` includes only `electron/**/*` + `src/services|utils|models|configs/**/*` and **explicitly excludes `src/ui/**`** — this is the enforced boundary between main-process code and renderer code. Renderer code is type-stripped by Vite/esbuild directly, not by this config.

- `src/services/` is **IPC-agnostic** — never call `ipcMain`/`ipcRenderer` from inside a service. Services are invoked from two places: `electron/ipc/*.ts` (local Electron IPC) and `src/services/http/handlers/*` (REST, for Employee/remote-worker mode). Writing a service this way keeps both call paths working.
- Renderer (`src/ui/`) talks to main only through `window.electronAPI` (exposed via `electron/preload.ts`'s `contextBridge`, `contextIsolation: true`, `nodeIntegration: false`). Never assume Node APIs are available in `src/ui/` code.

## Multi-account / multi-channel model

There is **no shared base class or interface** across the three channel service implementations in `src/services/{zalo,facebook,telegram}/` — they evolved independently:
- Zalo (`ZaloService`) and Facebook (`FacebookService`): OOP class + `static Map<string, Service>` keyed by account id, `static getInstance(accountId, ...)`.
- Telegram (`TelegramUserListener.ts`, `TelegramBotChannelService.ts`): module-level functions + `Map<string, T>` registries, not classes.

Unification happens **one level up**: `src/models/account.ts` (`Account` interface, `channel` discriminator column, all channels share the same DB tables) and `src/configs/channelConfig.ts` (`Channel` type + per-channel capability flags like `supportsPoll`/`supportsReaction`, consumed by `CRMChannelCapabilityService` for CRM gating and by renderer hooks like `useChannelCapability` for UI gating).

**When adding a new channel or channel action**: follow the Zalo/Facebook class+instance-map pattern for the service, register capabilities in `channelConfig.ts`, and add an adapter in `src/ui/lib/adapters/` implementing `BaseChannelAdapter` for the renderer side (see [src/ui/CLAUDE.md](src/ui/CLAUDE.md)). Note `configs/channelConfig.ts`'s `Channel` union and `workflow/WorkflowEngineService.ts`'s `WorkflowChannel` union are **separately maintained** — keep both in sync if you add a channel.

## Boss / Employee mode (multi-workspace)

The app supports a client-server "Boss" (owns local SQLite + accounts) / "Employee" (remote worker, filtered access) topology:
- Transport: `src/services/http/HttpRelayService.ts` (Boss REST server) + `src/services/socket/SocketIOService.ts` (Boss push, ring-buffer catch-up) ↔ `RestQueryService`/`SocketIOClient` (Employee side).
- Renderer decides local-IPC vs. remote-REST transparently via `src/ui/lib/data/DataAccessor.ts`, which checks `useEmployeeStore.getState().mode`. **New renderer data-fetching code should go through `DataAccessor` or the channel adapters — not call `ipc.db.*` directly** — otherwise it breaks in Employee mode.
- Employee auth is bcrypt + JWT (`EmployeeService.ts`); which DB tables sync Boss→Employee is a declarative allowlist (`DataSyncService.ts`'s `SYNCABLE_TABLES_BY_ZALO`).

## Build & dev commands

```bash
npm run dev              # vite (renderer, port 27799) + tsc --watch (main) + electron, concurrently
npm run build:electron   # one-shot compile of electron/ + src/services|utils|models|configs
npm run build:renderer   # vite build
npm run production       # full pipeline: E2EE bridge -> tsc prod -> strip-console -> vite build -> rebuild:native -> electron-builder
npm run rebuild:native   # fetch prebuilt better-sqlite3 binary matching the Electron ABI
```

`predev` best-effort builds the Facebook E2EE Go bridge (failure is tolerated with a warning — dev still works, just without E2EE 1:1 chat). `production`'s bridge build is **not** tolerant — a missing Go toolchain fails the production build.

## Testing — currently a gap

`jest.config.js` (ts-jest, node env) points at `src/__tests__/**/*.test.ts`, but **no test files exist anywhere in the repo**, there is **no `test` script** in `package.json`, and **no CI workflow runs tests**. If asked to add tests: create `src/__tests__/`, add a `"test": "jest"` script, and note that only Node-environment testing is currently wired up (main-process/services code) — testing React components in `src/ui/` would need a jsdom environment + Testing Library added first.

## Known inconsistencies (don't "fix" silently — flag if relevant to your task)

- **Secret encryption** (`safeStorage`) is implemented three separate times: `src/services/secure/SecureSettingsService.ts` (the intended shared module), plus inline duplicates in `AIAssistantService.ts` and `IntegrationRegistry.ts`. Prefer `SecureSettingsService` for any new encrypted-secret code.
- **`react-router-dom`** is a dependency but **unused** in `src/ui/` — navigation is a hand-rolled `view` union in `appStore.ts` + a `nav:view` CustomEvent, switched on in `App.tsx`. Do not introduce `<Routes>/<Route>`; extend the `AppView` union instead.
- Two separate embedded webhook HTTP servers exist on adjacent ports by design, not accident: `IntegrationRegistry` (port 9888, POS/payment webhooks) and `WebhookGatewayService` (port 9889, workflow webhooks) — comments in the code note they're kept separate "to avoid regression," so don't merge them without checking both call sites.
- `vite-plugin-electron`/`vite-plugin-electron-renderer` are devDependencies but **not wired into `vite.config.ts`** — main-process compilation is done via plain `tsc` (see build commands above). Don't assume the Vite electron plugin pipeline is in play.

## Security notes

- Renderer is sandboxed (`contextIsolation: true`, `nodeIntegration: false`); all main-process access goes through the typed `window.electronAPI` surface.
- ERP identity/authorization is always resolved **server-side** (`ErpAuthContext.resolve()` in main process) — an IPC handler must never trust an `employeeId` supplied by the renderer. See [electron/ipc/CLAUDE.md](electron/ipc/CLAUDE.md).
- Facebook E2EE (`src/bridge-e2ee/`) is an optional, gracefully-degrading Go subprocess bridge (JSON-RPC over stdio) — its absence disables 1:1 encrypted chat only; group messaging via MQTT is unaffected.
- `src/services/tracking/TrackingService.ts` sends anonymous license-renewal telemetry to `deplaoapp.com` — it is documented as PII-free by design; preserve that invariant if you touch this file.

## Runtime scratch space (`.rtk/`)

`.rtk/` is a gitignored, repo-local scratch directory for throwaway runtime/debug artifacts produced while working in this codebase (e.g. a captured IPC payload while investigating a bug). It has no role in the shipped app — the app's real runtime data (SQLite DB, media cache, workspace config) lives in Electron's `app.getPath('userData')`, outside the repo, per `DatabaseService`/`FileStorageService`. See [.rtk-usage.md](.rtk-usage.md) for what belongs there. Note: unrelated to the `rtk` (Rust Token Killer) CLI some contributors may have installed globally — same name, different tool.

## Coding conventions

- Service singletons: `class XService { private static instance; static getInstance() {...} }`. Multi-account services (Zalo/Facebook) additionally keep `static Map<string, Service>` keyed by account id.
- IPC channel naming: `domain:resource:action` (e.g. `erp:task:list`, `window:minimize`).
- IDs are `string` almost everywhere except HRM/task-support tables (checklist, comment, department, position, notification, attendance, leave), which use numeric `id`. Timestamps are epoch-ms `number`, except HRM dates which are `'YYYY-MM-DD'` strings.
