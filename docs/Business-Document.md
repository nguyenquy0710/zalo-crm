# Business Document — Deplao

## What it is

Deplao is a Windows/macOS/Linux desktop application that lets a person or a small team manage **multiple Zalo, Facebook, and Telegram accounts** from a single unified inbox, with built-in **CRM** (campaigns, contacts, tags, notes), a lightweight **ERP** (tasks, calendar, notes, HR/attendance with role-based permissions), a visual drag-and-drop **workflow automation builder**, and an **AI Assistant** for auto-replies/classification.

## Target audience

Vietnamese SMB sales, customer-care ("CSKH"), and marketing teams who run business communication primarily over Zalo (dominant in Vietnam) and secondarily Facebook Messenger/Telegram, and currently juggle multiple logged-in accounts and ad hoc spreadsheets instead of a unified tool.

## Value proposition

- **Unification**: one inbox for three chat platforms instead of switching between browser tabs/phones per account.
- **Team operation, not just personal use**: the built-in Boss/Employee mode lets a business owner ("Boss," holding the local database and accounts) give filtered, permissioned remote access to staff ("Employee") without each employee needing their own copy of every account's credentials.
- **Automation**: the workflow builder lets non-developers wire up auto-replies, CRM actions, and third-party integrations (KiotViet, Haravan, Sapo, Nhanh, Pancake for e-commerce/POS; Casso/SePay for payments; GHN/GHTK for shipping) triggered by chat events, without writing code.
- **Consolidation of CRM + ERP + chat**: contacts, campaigns, and internal task/calendar/HR management live in the same app as the conversations they relate to, rather than in a separate SaaS CRM the team has to re-sync.

## Monetization signal

`src/services/tracking/TrackingService.ts` sends anonymous (explicitly documented as PII-free), rate-limited pings to `deplaoapp.com` — described in code comments as being for premium license renewal, implying a licensed/paid tier gates some functionality. The specifics of what's gated are not evident from the tracking code alone.

## Distribution

Installers are built for Windows (nsis), macOS (dmg, x64+arm64), and Linux (AppImage, deb) via CI (`.github/workflows/build-*.yml`) and published to the separate `babyvibe/deplao-builder` GitHub repo's Releases. The public-facing marketing/download site (`landing/`) is deployed to GitHub Pages under that same `deplao-builder` path, not to `deplaoapp.com` directly — worth confirming with whoever owns the domain/release process whether that's intentional or a migration-in-progress.
