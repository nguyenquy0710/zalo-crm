# CLAUDE.md — landing/

Standalone marketing/landing site for ZaloCRM — **fully separate app**, not part of the Electron build. See root [../CLAUDE.md](../CLAUDE.md) first.

## It is a different project

Own `package.json` (`zalocrm-landing`), own `vite.config.ts`/`tsconfig.json`/`tailwind.config.js`/lockfile. Depends only on `react`, `react-dom`, `react-router-dom`, `three` — none of the root app's dependencies. **Run `npm install` inside `landing/` separately**; it is not covered by the root install.

## Deploy target vs. product homepage

`landing/vite.config.ts` sets `base: '/zalo-crm/'` and `landing/index.html`'s canonical link matches — the site is built to be served from GitHub Pages at `nguyenquy0710.github.io/zalo-crm/` (same repo as the app source), **not** `zalo-crm.quyit.id.vn` (the `homepage` field in the root `package.json`). Deployment is `.github/workflows/deploy-landing.yml`, triggered on push to `main` touching `landing/**`, which builds and publishes `landing/dist` to the `gh-pages` branch via `peaceiris/actions-gh-pages`. If asked to change the deploy target or domain, this mismatch is probably relevant context, not a bug to silently "fix."

## Routing

Uses `HashRouter` (GitHub Pages-friendly, avoids server-side rewrite rules) with exactly two routes: `/` (`LandingPage`) and `/terms` (`TermsPage`). `landing/public/404.html` implements the classic GH-Pages SPA-redirect shim (query-string trick), decoded back in `index.html`.

## Version and download links must be updated manually

`landing/src/constants.ts` hardcodes `APP_VERSION` and per-platform download URLs (Windows `.exe`, macOS arm64/x64 `.dmg`, Linux `.AppImage`/`.deb`), all pointing at `github.com/nguyenquy0710/zalo-crm/releases`. **There is no automated sync with the root `package.json` `version` field** — if you bump the app version, update `APP_VERSION` here too, or the landing page will advertise a stale version/download link.

## Structure

`src/pages/` (`LandingPage.tsx`, `TermsPage.tsx`), `src/components/` (`Navbar`, `Hero`, `Features`, `HowItWorks`, `WorkflowShowcase`, `IntegrationShowcase`, `DownloadCTA`, `DownloadDropdown`, `Footer`, `ThreeCanvas` for the three.js visual). No test tooling configured here at all.
