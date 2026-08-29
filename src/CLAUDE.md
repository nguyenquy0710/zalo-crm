# CLAUDE.md — src/

See root [../CLAUDE.md](../CLAUDE.md) for product/architecture overview first.

## Subdirectories

| Path | Purpose | Deeper guidance |
|---|---|---|
| `services/` | Main-process business/domain logic (Zalo/FB/Telegram, CRM, ERP, workflow, DB, events, HTTP relay). IPC-agnostic — never call `ipcMain`/`ipcRenderer` here. | [services/CLAUDE.md](services/CLAUDE.md) |
| `ui/` | React renderer (components, hooks, Zustand stores, IPC bridge). | [ui/CLAUDE.md](ui/CLAUDE.md) |
| `models/` | Pure TypeScript type/interface definitions, no runtime logic. Re-exported from `models/index.ts`. Add new shared domain types here — consumed by `services/`, `ui/`, and `electron/`. |
| `configs/` | Small config/constants modules: `channelConfig.ts` (per-channel capability matrix — the source of truth for what Zalo/Facebook/Telegram each support), `BuildConfig.ts`, `telegram.config.ts`, `VietnamAdministrative.ts` + `configs/hanhchinhVN/*.json` (Vietnam province/district/ward reference data for address fields). |
| `bridge-e2ee/` | Standalone Go binary (not a native Node addon) implementing Facebook E2EE via the Signal Protocol / Meta Labyrinth. Communicates with TS over line-delimited JSON-RPC on stdio. Built by `scripts/build-bridge-e2ee.js` (requires Go ≥1.24); its absence is tolerated at runtime — `FacebookService` degrades to non-E2EE group messaging only. See `src/services/facebook/FacebookE2EEBridge.ts` for the TS-side wrapper. |
| `logo/`, `assets/` | Static images (app icon, donation QR, login help screenshots). No logic. |

## Main/renderer boundary

`tsconfig.electron.json` includes `electron/**/*` + `src/services|utils|models|configs/**/*` and **excludes `src/ui/**`**. This is enforced by the build (main-process `tsc` compile), not just convention — importing `src/ui/*` from `src/services/*` or `electron/*` will not compile correctly for the main process bundle. Keep Node-only code (fs, better-sqlite3, child_process, Electron APIs) out of `src/ui/`.

## Path aliases

Both the root `tsconfig.json` (`"@/*": ["src/ui/*"]`, used for IDE/editor type-checking) and `vite.config.ts` (`resolve.alias: '@' -> src/ui`, used by the actual Vite build) point `@` at `src/ui` specifically, **not** at `src/`. There is no alias for `src/services` or `src/models` — import those with relative paths.
