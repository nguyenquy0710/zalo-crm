# Testing rules

## Current state: no tests exist

`jest.config.js` is configured (`ts-jest`, `testEnvironment: 'node'`, `testMatch: ['<rootDir>/src/__tests__/**/*.test.ts']`) but:
- No `src/__tests__/` directory exists.
- No `.test.ts`/`.spec.ts` file exists anywhere in the repo (root app or `landing/`).
- Root `package.json` has **no `test` script**.
- No CI workflow runs Jest — the four `build-*.yml`/`build-all.yml` workflows go straight from compile to package, no test gate.

Do not assume test coverage exists for code you're modifying. Do not claim "tests pass" without first checking whether a test even exists for that code path.

## If asked to add tests

- Place new test files under `src/__tests__/`, named `*.test.ts`, matching the existing `jest.config.js`.
- Add `"test": "jest"` to `package.json` scripts — it's currently missing.
- The configured environment is Node only. It suits `electron/`, `src/services/`, `src/utils/`, `src/models/` (main-process-style code) directly.
- Testing `src/ui/` React components is **not currently supported** by this Jest config (no jsdom environment, no Testing Library dependency). If asked to test renderer components, flag that this needs `jest-environment-jsdom` + `@testing-library/react` added first, rather than silently trying to shoehorn a component test into the node environment.
- `better-sqlite3`-backed services (most of `src/services/`) can be tested against a real in-memory/temp-file SQLite DB since it's synchronous and has no external server dependency — prefer that over mocking `DatabaseService`.
