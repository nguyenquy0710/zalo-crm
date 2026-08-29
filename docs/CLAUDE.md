# CLAUDE.md — docs/

Documentation standards for this repo. See root [../CLAUDE.md](../CLAUDE.md) first.

## What lives here

- `Business-Document.md` — product/business context (audience, value proposition, monetization). Read this before writing user-facing copy, release notes, or anything that needs to reflect *why* a feature exists, not just how it's built.
- Add new engineering docs (architecture deep-dives, runbooks, ADRs) here rather than scattering `README.md` files through feature directories, unless the doc is genuinely local to one module (e.g. `src/bridge-e2ee/` already has its own README for the Go bridge — leave module-local build/setup docs there).

## Keep in mind when writing docs

- This repo (`zalo-crm`) is the source; released binaries and the deployed landing page live in the separate `babyvibe/deplao-builder` repo (see root CLAUDE.md). Don't write install/download instructions that assume artifacts are built or hosted from this repo.
- The product is branded "Deplao" in-app and in the build config (`appId: com.Deplao.app`), even though the repo/folder name is `zalo-crm` — use "Deplao" in user-facing docs, keep "zalo-crm" for repo/dev-tooling references.
