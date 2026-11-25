# Performance & Size Budgets (NFR-PERF / NFR-DIST)

| Budget | Target | Measured | Status |
|---|---|---|---|
| CLI `version` startup & lazy-load | `< 1500 ms`, zero `ink`/`react` static import in `src/cli/main.ts` | Verified in `test/unit/cli/lazy-load.test.ts` | PASS |
| npm package unpacked size (excl. `rea-agents`) | `<= 25 MB` | `963.7 kB` (29 files, `208.6 kB` gzipped) via `npm publish --dry-run` & `pack:check` | PASS |
| Single-process REA supervisor | 1 child process per session | Enforced by `ReaSupervisor` & verified in `rea-real.test.ts` | PASS |
| Build artifact (`tsup`) | Clean ESM chunks | `89 ms` build (`dist/cli.js` 32.44 KB + lazy `interactive` & `ui` chunks) | PASS |
