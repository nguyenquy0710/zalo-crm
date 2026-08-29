# CLAUDE.md — electron/ipc/

IPC handler layer between the renderer and `src/services/`. See [../CLAUDE.md](../CLAUDE.md) first.

## Pattern: one file per domain

Each file (`loginIpc.ts`, `zaloIpc.ts`, `facebookIpc.ts`, `databaseIpc.ts`, `crmIpc.ts`, `workflowIpc.ts`, `erp*Ipc.ts`, etc.) exports a `registerXxxIpc()` function, called exactly once from `electron/main.ts` inside `app.whenReady()`. There is no central router/registry object — `main.ts`'s flat call list *is* the registry.

**To add a new IPC handler:**
1. Add it to the relevant domain file (or create a new `<domain>Ipc.ts` if it's a genuinely new domain) as `ipcMain.handle('domain:resource:action', async (event, ...) => {...})`.
2. Delegate to a `src/services/<domain>/XService.getInstance()` method — don't put business logic directly in the IPC handler.
3. Register the file's `registerXxxIpc()` call in `main.ts` if it's a new file.
4. Mirror the channel in `electron/preload.ts` (`contextBridge`) and typically in `src/ui/lib/ipc.ts`'s typed façade.

Channel naming convention: `domain:resource:action` (e.g. `erp:task:list`, `crm:campaign:create`, `window:minimize`).

## ERP handlers — must use the shared middleware

Every `erp*Ipc.ts` file wraps its handlers with `withErpAuth(action, handler)` from `erpIpcMiddleware.ts`:
- Resolves the actor's identity/role **server-side** via `ErpAuthContext.resolve()` — a handler must never trust an `employeeId` passed from the renderer.
- Optionally enforces RBAC via `ErpAuthContext.requirePermission(action, ctx)` against the matrix in `src/services/erp/permissions.ts`.
- Normalizes the return value into `{ success: true, ...result }` or `{ success: false, error, code }` — handlers signal failure by **throwing**, not by returning an error object themselves.
- Input validation uses the exported `erpValidate` helpers (string/enum/int/required) inline in the handler before calling the service.

**Any new ERP IPC handler should follow this exact shape**: `erpValidate` the input → `withErpAuth('resource.action', async (ctx) => {...})` → call `ErpXService.getInstance()` → return a plain object (the envelope wraps it automatically).

## Non-ERP domains

Other domain handlers (`zaloIpc.ts`, `facebookIpc.ts`, `databaseIpc.ts`, etc.) don't use `withErpAuth` — they call their service singleton directly. There's no equivalent shared auth middleware for them; if you're adding permission checks to a non-ERP handler, check how similar existing handlers in that file do it rather than assuming `withErpAuth` applies.
