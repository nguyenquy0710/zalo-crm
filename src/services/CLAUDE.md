# CLAUDE.md — src/services/

Main-process business/domain layer. See [../CLAUDE.md](../CLAUDE.md) and root [../../CLAUDE.md](../../CLAUDE.md) first.

## Ground rules for this directory

- **No IPC here.** Services are called from `electron/ipc/*.ts` (local) and `http/handlers/*` (remote/Employee REST) — never import `ipcMain`/`ipcRenderer` inside `src/services/`.
- **No ORM.** Persistence is `better-sqlite3` (sync, WAL mode) behind one singleton: `database/DatabaseService.ts` (~8k lines — the app's god-object). New persistence code extends this file's `migrate()` chain and adds typed helper methods; don't introduce a second DB layer.
- **No message broker/queue library.** Real-time fan-out is `event/EventBroadcaster.ts` (static class, `onBeforeSend(channel, cb)` hooks with an unsubscribe-function return — follow that disposer convention). "Jobs"/automation is `workflow/WorkflowEngineService.ts` (event-triggered node/edge graphs) plus small purpose-built queues (`workflow/AccountSendQueue.ts`, ad-hoc `Map<string, Promise<...>>` chains in Telegram code) — don't reach for BullMQ/RabbitMQ/etc, it isn't the pattern here.
- **Multi-account pattern is inconsistent by history, not by design flaw to "fix" reflexively**: Zalo/Facebook use `class + static Map<string, Service> + getInstance(accountId)`; Telegram uses module-scoped functions + Maps. Follow whichever sibling pattern is closest to what you're extending; don't unify them as a side effect of an unrelated task.

## Subdirectory map

| Dir | Responsibility | Key file(s) |
|---|---|---|
| `ai/` | AI Assistant CRUD + LLM calls (OpenAI/Gemini/Deepseek/Grok-compatible) | `AIAssistantService.ts` |
| `cache/` | Employee-mode-only in-memory/disk caches for instant UI | `EmployeeCache.ts`, `MediaCacheService.ts` |
| `crm/` | Campaign send queue, per-channel capability gating, BBCode-style markup parser | `CRMQueueService.ts`, `CRMChannelCapabilityService.ts`, `message-markup.ts` |
| `database/` | The only persistence layer, singleton, all schema/migrations/queries | `DatabaseService.ts` |
| `employee/` | Boss↔Employee auth (bcrypt+JWT) and declarative table-sync rules | `EmployeeService.ts`, `DataSyncService.ts` |
| `erp/` | Tasks/calendar/notes/HRM/RBAC. Identity always resolved server-side, never trusts renderer `employeeId`. | `permissions.ts`, `ErpAuthContext.ts`, `Erp*Service.ts` |
| `event/` | Central main→renderer event broadcast + workflow-trigger hook point | `EventBroadcaster.ts` |
| `facebook/` | Facebook Messenger: login, MQTT listener, send, E2EE, thread scanning | `FacebookService.ts` (+ split files by concern) |
| `file/` | Workspace-aware media/file storage path resolution | `FileStorageService.ts` |
| `http/` | Boss REST relay server + Employee REST client — the "backend API" for remote mode | `HttpRelayService.ts`, `RestQueryService.ts`, `handlers/RestApiHandlers.ts` |
| `integrations/` | Pluggable adapters (KiotViet/Haravan/Sapo/Nhanh/Pancake/Casso/SePay/GHN/GHTK) + webhook server (port 9888) | `IntegrationAdapter.ts` (abstract base — the one real Strategy pattern here), `IntegrationRegistry.ts`, `adapters/*.ts` |
| `library/` | Shared media library (images/files/videos) across accounts | `LibraryService.ts` |
| `login/` | Thin façade over `utils/ZaloLoginHelper` for QR login | `LoginService.ts` |
| `secure/` | Canonical `safeStorage`-backed secret encryption (`secureSet/secureGet/secureDelete`) | `SecureSettingsService.ts` |
| `socket/` | Employee-mode push transport (Socket.IO), ring-buffer catch-up on reconnect | `SocketIOService.ts`, `SocketIOClient.ts`, `EventBuffer.ts` |
| `tracking/` | Anonymous, PII-free license-renewal telemetry to deplaoapp.com | `TrackingService.ts` |
| `tunnel/` | Exposes local servers publicly via Cloudflare Quick Tunnels | `TunnelService.ts` |
| `workflow/` | Visual automation engine (~100 `NodeType`s), webhook gateway (port 9889), per-account send queue | `WorkflowEngineService.ts`, `WebhookGatewayService.ts`, `AccountSendQueue.ts` |
| `zalo/` | Core Zalo account connection/session (the original channel) | `ZaloService.ts` |

## Things to check before writing new code here

- **Secrets**: use `secure/SecureSettingsService.ts`. Don't re-implement `safeStorage` encryption inline (it's already duplicated in `ai/` and `integrations/` — don't add a fourth copy).
- **New channel actions**: register capability flags in `src/configs/channelConfig.ts`; if the action needs a workflow trigger/action node, also update `workflow/WorkflowEngineService.ts`'s `WorkflowChannel` union (kept separately from `channelConfig.ts`'s `Channel` union).
- **New ERP handler logic**: put authorization checks in `erp/permissions.ts` (`ERP_PERMISSIONS`), not ad hoc in the service — `electron/ipc/erpIpcMiddleware.ts` and individual handlers both read from it.
- **Anti-spam**: outbound message sends for CRM/workflow should go through `workflow/AccountSendQueue.ts` (per-account promise chain with randomized delay) — it exists specifically because concurrent auto-replies previously triggered Zalo's spam detection.
