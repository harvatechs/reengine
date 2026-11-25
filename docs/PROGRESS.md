# ReEngine CLI — Engineering Progress & Gate Ledger

## 1. Product & Architecture Summary

1. **ReEngine CLI** (`reengine`, alias `ree`) is an open-source, model-agnostic reverse-engineering terminal harness in strict ESM TypeScript on Node.js (`^22.19.0 || ^24.11.0 || >=26`).
2. It embeds **REA** (`rea-agents`, MIT) as a single supervised child process per session over stdio MCP (`@modelcontextprotocol/sdk`), requiring zero manual MCP JSON from users.
3. Three custom `undici`/`fetch` + SSE adapters (`openai-compatible`, `anthropic`, `gemini`) provide universal LLM/router connectivity purely through layered JSONC config and Zod-validated presets.
4. The architecture is a single npm package (`reengine-cli`) with strict `dependency-cruiser`-enforced layers: `util/platform` → `core` (frozen `contracts.ts` at G1.5) → `config/providers/tools/mcp/engine` → `ui` → `app` → `cli`.
5. Security defaults are restrictive: `default` permission mode is ask-first, untrusted target/MCP content triggers a taint guard, folder configs are trust-gated, child envs are scrubbed, and secrets use references (`env:`, `file:`, `keychain:`).
6. Large tool/REA outputs spill to content-addressed SHA-256 artifacts while the model receives bounded head/tail views (`artifact_read`/`artifact_search`).
7. Evidence adapters normalize REA outputs into `observed | inferred | unknown` records without mutating or upgrading inferences, retaining raw payloads in artifacts.
8. The Ink/React TUI strictly separates finalized `<Static>` transcript items from the 30 fps-capped live region, sanitizes untrusted escapes, and uses semantic theme tokens plus a terminal-profile exporter.
9. Headless `reengine run` supports `text`, `json`, and `stream-json` (NDJSON) outputs with deterministic exit codes (`0`–`7`, `130`).
10. Every external contract (REA CLI/MCP, provider wire formats, Ink/React compatibility) is captured from ground-truth artifacts in Phase 0 before writing product code.

---

## 2. Gate List

| Gate | Phase | Pass Criteria | Artifact | Status |
|---|---|---|---|---|
| **G0** | Phase 0 (Discovery) | P0-01…P0-10 complete; REA CLI/MCP & provider wire fixtures + contract docs committed; deps pinned; A1–A5 logged | `docs/gates/G0.md` | PASSED |
| **G1** | Phase 1 (Foundation) | CI green on 3 OS × Node 22/24; `version`/`config` work; layering, trust, secrets, schema parity pass | `docs/gates/G1.md` | PASSED |
| **G1.5** | Contracts Freeze | `src/core/contracts.ts` matches `specs.md` §4 + type tests; tagged `gate-G1.5` | `docs/gates/G1.5.md` | PASSED |
| **G2** | Phase 2 (Providers) | Shared contract suite green for 3 adapters on mock LLM; 12 presets validated; `providers test` works | `docs/gates/G2.md` | PENDING |
| **G3** | Phase 3 (Core & Tools) | `reengine run` completes multi-step tool loop on mock LLM (permissions, spill, compaction, cancel, resume) | `docs/gates/G3.md` | PENDING |
| **G4** | Phase 4 (MCP & REA) | Headless run analyzes JS fixture via real pinned REA; doctor, drift test, policy completeness, 0 orphans | `docs/gates/G4.md` | PENDING |
| **G5** | Phase 5 (UI) | All FR-UI M items verified; `ink-testing-library` green; terminal restore & exporter golden tests pass | `docs/gates/G5.md` | PENDING |
| **G6** | Phase 6 (RE Polish) | Evidence UI, asm highlighting, spill UX, `/report`, auto-snapshot, `REENGINE.md`/`/init`, first-run gate | `docs/gates/G6.md` | PENDING |
| **G7** | Phase 7 (Release) | `acceptance-checklist.md` 100% ticked with evidence; perf budgets & SK-14 pass; pack/Docker/dry-run green | `docs/gates/G7.md` | PENDING |

---

## 3. Provisional Assumptions & Spec Contradictions / Ambiguities

### Provisional G0 Assumptions (A1–A5, adopted default per Autonomy Contract)
| ID | Assumption | Status | Notes |
|---|---|---|---|
| **A1** | License MIT | **PROVISIONAL** | MIT `LICENSE` + `THIRD_PARTY_NOTICES.md` for MIT/Apache-2.0 deps |
| **A2** | npm package name `reengine-cli` | **PROVISIONAL** | Verified 404 (available) on `registry.npmjs.org` in P0-01 |
| **A3** | Bundle `rea-agents` as exact-pinned dependency | **PROVISIONAL** | `rea-agents@6.10.1` (MIT, 186 MB unpacked; excluded from 25 MB `NFR-DIST-01` budget per spec) |
| **A4** | Windows supported for ReEngine; REA support follows REA's matrix | **PROVISIONAL** | Local Windows environment verified; CI covers Ubuntu, macOS, Windows |
| **A5** | Update check against npm registry default-on, notify-only, opt-out | **PROVISIONAL** | Disabled via `updates.check=false` or `REENGINE_NO_UPDATE_CHECK=1` |

### Logged Spec Contradictions & Ambiguities (Precedence: `rules.md` > `security-and-permissions.md` > `specs.md` > `integrations-spec.md` > `config-reference.md` > `ui-design-spec.md` > `guidelines.md`)
1. **Existing repository scaffold vs. `specs.md` §3 / ADR-003:** The pre-existing workspace in `E:\RECLI` was a `pnpm` monorepo (`packages/*`, `dist-exe/reengine.exe`), whereas `docs/spec` mandates a single `npm` package (`src/`, `bin/reengine.js`, `package-lock.json`, no Node SEA in v1.0 per N-98). **Resolution (SAFER / Precedence):** Follow `docs/spec` (`specs.md` §3 + `decisions.md` ADR-001/003 + `rules.md`) strictly; in Phase 1 (P1-01) we will scaffold the exact `src/` single-package layout and cleanly replace/remove the legacy monorepo scaffolding.
2. **REA MCP stdio invocation (`integrations-spec.md` §3.1 vs `rea-agents` CLI):** `integrations-spec.md` §3.1 writes `rea mcp`, while our P0-02/P0-03 verification will check whether `rea-agents` v6.10.1 uses `rea --mcp` vs `rea mcp`. **Action:** Capture exact CLI/MCP behavior in P0-02/P0-03 and raise an S3 Change Proposal if `rea mcp` differs from reality.
3. **Theme count & naming (`user-requirements.md` FR-UI-01 / `ui-design-spec.md` §7):** Both specify 5 built-in themes (`reengine-dark`, `reengine-light`, `high-contrast`, `mono`, `solarized`). We will implement these exact 5 names and token structure from `ui-design-spec.md` §6–7.
4. **Lint/Format toolchain (`specs.md` §2 / `testing-and-quality.md` §7 vs pre-existing `biome.json`):** `docs/spec` mandates ESLint (`typescript-eslint` + custom rules `no-ui-literals`, `no-console`, banned-TODO) + Prettier + `dependency-cruiser` + `knip`. We will adopt ESLint + Prettier + `dependency-cruiser` + `knip` per `specs.md` §2 at P1-01.

---

## 4. Task Ledger

| Task ID | Status | Date | Evidence | Notes |
|---|---|---|---|---|
| P0-01 | DONE | 2026-11-25 | [P0-01](progress/P0-01.md) · [environment.md](contracts/environment.md) | Toolchain, npm `reengine-cli` (available), `rea-agents` verified |
| P0-02 | DONE | 2026-11-25 | [P0-02](progress/P0-02.md) · [cli/README.md](../test/fixtures/rea/6.4.0/cli/README.md) | Captured 7 CLI fixtures from `rea-agents@6.4.0`; filed CP-1 |
| P0-03 | DONE | 2026-11-25 | [P0-03](progress/P0-03.md) · [mcp/README.md](../test/fixtures/rea/6.4.0/mcp/README.md) | Captured 170 tools & 6 prompts via `capture-rea-contract.ts` |
| P0-04 | DONE | 2026-11-25 | [P0-04](progress/P0-04.md) · [rea-tools.md](contracts/rea-tools.md) | 170/170 REA tools classified |
| P0-05 | DONE | 2026-11-25 | [P0-05](progress/P0-05.md) · [rea-workflow-source.md](contracts/rea-workflow-source.md) | Vendored REA workflow rules + `THIRD_PARTY_NOTICES.md` |
| P0-06 | DONE | 2026-11-25 | [P0-06](progress/P0-06.md) · [wire-openai-compatible.md](contracts/wire-openai-compatible.md) | Official SSE wire contracts & synthetic stream fixtures |
| P0-07 | DONE | 2026-11-25 | [P0-07](progress/P0-07.md) · [ink-spike.md](contracts/ink-spike.md) | Verified `ink@5.1.0` + `react@18.3.1` + `ink-testing-library@4.0.0` |
| P0-08 | DONE | 2026-11-25 | [P0-08](progress/P0-08.md) · [dependencies.md](contracts/dependencies.md) | Pinned 19 runtime deps + 1 optional + dev deps |
| P0-09 | DONE | 2026-11-25 | [P0-09](progress/P0-09.md) · [ux-reference.md](contracts/ux-reference.md) | Clean-room UX reference checklist |
| P0-10 | DONE | 2026-11-25 | [G0.md](gates/G0.md) · [G0-security.md](gates/G0-security.md) | Gate G0 PASSED (`gate-G0`) |
| P1-01 | DONE | 2026-11-25 | [P1-01](progress/P1-01.md) | Single-package TS/ESLint/Prettier/depcruise/knip/vitest/tsup scaffold |
| P1-02 | DONE | 2026-11-25 | [P1-02](progress/P1-02.md) | SHA-pinned CI, REA drift, CodeQL workflows, and Dependabot |
| P1-03 | DONE | 2026-11-25 | [P1-03](progress/P1-03.md) | `src/util/` (`result`, `errors`, `redact`, `logger`, `clock`, `ids`, `abort`) + tests |
| P1-04 | DONE | 2026-11-25 | [P1-04](progress/P1-04.md) | `src/platform/` (`paths`, `env`, `process`, `terminal`) + tests |
| P1-05 | DONE | 2026-11-25 | [P1-05](progress/P1-05.md) | `src/config/` Zod schema, JSONC loader, migrations, `schemas/config.v1.schema.json` |
| P1-06 | DONE | 2026-11-25 | [P1-06](progress/P1-06.md) | `src/config/secrets.ts` (`env:`, `file:`, `keychain:`, literal policy) |
| P1-07 | DONE | 2026-11-25 | [P1-07](progress/P1-07.md) | `src/config/trust.ts` (`trust.json` gated-subset SHA-256) |
| P1-08 | DONE | 2026-11-25 | [P1-08](progress/P1-08.md) · [G1.5.md](gates/G1.5.md) | `src/core/contracts.ts` frozen (`gate-G1.5`) |
| P1-09 | DONE | 2026-11-25 | [P1-09](progress/P1-09.md) · [G1.md](gates/G1.md) | `src/cli/` skeleton, `version`, `config *`, `completion`, `install-smoke` (`gate-G1`) |
