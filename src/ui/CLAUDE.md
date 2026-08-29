# CLAUDE.md — src/ui/

React renderer for the Electron app. See [../CLAUDE.md](../CLAUDE.md) and root [../../CLAUDE.md](../../CLAUDE.md) first.

## No router — do not add one

`react-router-dom` is a listed dependency but **unused**. There is no URL-based routing. Top-level "screens" are a union type `AppView` in `store/appStore.ts` (`'chat'|'friends'|'settings'|'dashboard'|'crm'|'workflow'|'integration'|'analytics'|'erp'`), rendered conditionally by `App.tsx`. Navigate via `setView(...)` or the global `nav:view` CustomEvent (for deeply nested components avoiding prop drilling). **To add a new top-level screen: extend `AppView`, wire it into `App.tsx`'s conditional render — do not introduce `<Routes>`/`<Route>`.**

## State — Zustand, no middleware

11 stores under `store/` (`appStore`, `accountStore`, `chatStore`, `crmStore`, `employeeStore`, `workspaceStore`, `updateStore`, plus `store/erp/*` for ERP domains), each `create<T>((set, get) => ({...}))` with **no `persist`/`devtools`/`immer`**. Disk/DB persistence happens explicitly via IPC/`DataAccessor` calls inside store actions, not via Zustand middleware. Cross-store reads use `useXStore.getState()` inside another store or a component effect — stores are not composed together.

`useEmployeeStore`'s `mode` (`'employee'` vs standalone/boss) is checked pervasively to branch local-IPC vs. remote-REST behavior — see `DataAccessor` below.

## IPC bridge — use the right layer

Three layers, increasing abstraction — prefer the highest one that fits:
1. `window.electronAPI.*` — raw preload surface (`contextBridge`), one namespace per domain (`zalo`, `fb`, `erp`, `db`, ...).
2. `lib/ipc.ts` — typed façade re-exporting a flattened `ipc.<domain>.<method>()` object; also wraps ERP calls (`wrapErpApi`) to surface permission-denied dialogs automatically.
3. `lib/channelIpc.ts` + `lib/adapters/*` — **channel-agnostic** façade (`sendMessage(channel, params)` etc.) that dispatches to `ZaloAdapter`/`FacebookAdapter`/`TelegramBotAdapter`/`TelegramUserAdapter` via `lib/adapters/registry.ts`. Use this for any action that should work identically across Zalo/Facebook/Telegram.
4. **`lib/data/DataAccessor.ts`** — the critical indirection for reads: checks `useEmployeeStore.getState().mode` and routes to local `window.electronAPI`/`ipc` (Boss/standalone) or to `RestQueryService` REST calls (Employee mode). **New data-fetching code should go through `DataAccessor` (or the channel adapters), not call `ipc.db.*` directly** — bypassing it breaks Employee mode silently.

Push events from main arrive via `window.electronAPI.on('event:message' | 'workspace:switched' | 'fb:onMessage' | ..., handler)`, consumed by hooks (`useChatEvents`, `useZaloEvents`) that funnel into stores. `.on()` returns an `unsub()` — always clean up in effect teardown.

## Component organization

Domain-first under `components/<domain>/` (chat, crm, workflow, integration, settings, layout, dashboard, analytics, auth, common). `features/erp/` is a newer, more self-contained feature-folder convention (pages + `shared/` + its own stores/hooks under `store/erp/`, `hooks/erp/`) — **prefer this feature-folder shape for new domains**, not the older flat `components/<domain>/` tree.

- Naming: PascalCase `.tsx` matching the exported component; some files intentionally bundle several related small components (`GroupModals.tsx`, `WorkflowNodes.tsx`).
- No dedicated design-system/primitives folder. Shared bits are a handful of Tailwind `@layer components` classes in `index.css` (`.btn-primary`, `.btn-secondary`, `.input-field`) plus `components/common/icons.tsx`. Most styling is inline Tailwind utility classes in JSX — match that rather than introducing a component-library dependency.
- `tsconfig.json` has `"strict": false` — existing code uses `any` fairly freely; don't feel obligated to retrofit strict typing across files you're not otherwise touching, but do type new code properly.

## Styling / theme

Tailwind, dark mode via `darkMode: ['selector', '[data-theme="dark"]']` — toggled by setting `document.documentElement.dataset.theme` in `App.tsx`, **not** the default `class="dark"` strategy. Font scaling is applied programmatically (`document.documentElement.style.fontSize`) from `appStore.fontSizeScale`. No CSS-in-JS.

## Hooks (`hooks/`)

`useChat.ts` is the primary chat hook (wraps store + DataAccessor/ipc) — build chat UI on top of it rather than wiring IPC/store directly in components. `useChatEvents`/`useZaloEvents` subscribe to push events at the app root. `useChannelCapability`/`useChannelInfo` read `configs/channelConfig.ts` for conditional UI. `hooks/erp/*` mirror this for the ERP feature.

## Third-party UI libs — scoped, not ambient

| Lib | Where |
|---|---|
| `recharts` | Analytics/CRM/ERP report charts only |
| `reactflow` | Workflow visual builder canvas only |
| `react-quill-new` | ERP task rich-text editor only |
| `dompurify` | Sanitizing rich HTML before render (ERP badges, changelog) |
| `react-zoom-pan-pinch` | Media viewer pan/zoom only |

Keep new usages of these similarly scoped to their feature rather than importing them ambiently.
