# division-of-work.md — Phases, Workstreams, Tasks, Gates

## 1. Roles

| Role | Responsibility | Can edit |
|---|---|---|
| **Architect/Reviewer** (1) | Owns gates, `contracts.ts`, ADRs, Change Proposals, merges | anything via PR review |
| **Builder** (1..N) | Implements tasks in an assigned workstream | its workstream's directories only |
| **QA** (may be a Builder) | Test suites, fixtures, e2e, perf, cross-platform | `test/`, `scripts/` |

Single-agent mode: one agent plays all roles but **must still write a gate report and self-review against `rules.md` before advancing**.

## 2. Workstreams and ownership

| WS | Name | Directories | Primary specs |
|---|---|---|---|
| A | Platform & Config | `src/util`, `src/platform`, `src/config`, `src/cli` (skeleton) | specs §3, config-reference |
| B | Providers | `src/providers`, `test/mocks/mock-llm` | integrations Part 1 |
| C | Core | `src/core`, `src/app` | specs §4–8 |
| D | Tools & Permissions | `src/tools`, `src/core/permissions.ts` | security §4–5 |
| E | MCP & Engine | `src/mcp`, `src/engine`, `test/mocks/mock-mcp` | integrations Parts 2–3 |
| F | UI | `src/ui`, `src/cli` (TUI entry) | ui-design-spec |
| G | Quality, Docs, Release | `test/e2e`, `scripts`, `.github`, `docs`, `Dockerfile` | testing, deployment |

## 3. Dependency graph

```
G0 ─► A ─► (G1) ─► contracts freeze G1.5 ─┬─► B ─► G2 ─┐
                                          ├─► D ───────┼─► C(loop) ─► G3 ─► E ─► G4 ─► F ─► G5 ─► RE polish G6 ─► Hardening/Release G7
                                          └─► (F theme engine may start after G1.5, parallel to B/D)
```

Parallelism allowed after **G1.5**: B ∥ D ∥ F-theme/shell ∥ E-mcp-core. The agent loop (C) integrates B+D at G3. UI integration with live events begins after G3.

## 4. Gates

| Gate | Passes when (all) | Evidence artifact |
|---|---|---|
| **G0** Discovery | P0-01…P0-10 done; fixtures + contract docs committed; dependency versions pinned; human sign-off on assumptions A1–A5 | `docs/gates/G0.md` |
| **G1** Foundation | CI green on 3 OS × Node 22/24; `reengine version/config` work; config layering/validation/trust/secrets tests pass; layer lint passes | `docs/gates/G1.md` |
| **G1.5** Contracts frozen | `contracts.ts` reviewed against specs §4; tag `gate-G1.5` | tag + note |
| **G2** Providers | Shared contract suite green for 3 adapters on mock server; `providers test` works on ≥1 real provider if keys available (recorded, not in CI) | `docs/gates/G2.md` |
| **G3** Core | `reengine run` completes a multi-step tool conversation (mock LLM) with permissions, spill, compaction, cancel, resume; coverage thresholds met | `docs/gates/G3.md` |
| **G4** MCP/REA | Headless run analyzes the JS fixture app through **real pinned REA** in CI; doctor works; drift test + policy-completeness test green; no orphan processes | `docs/gates/G4.md` |
| **G5** UI | All FR-UI M items demonstrated; ink-testing-library suites green; manual PTY matrix (3 OS) recorded | `docs/gates/G5.md` |
| **G6** RE polish | Evidence UI, asm highlighting, artifact spill UX, report export, REENGINE.md/init, first-run notice done | `docs/gates/G6.md` |
| **G7** Release | `acceptance-checklist.md` fully ticked; rc published to `next` tag and install-tested; no open S1–S3 | `docs/gates/G7.md` |

Gate report template: *scope · tasks · test evidence (command + output summary) · deviations/Change Proposals · risks · security review (SK-14) · go/no-go*.

## 5. Task list

Format: **ID** · task · depends · deliverable · acceptance (requirement IDs).

### Phase 0 — Discovery & Contract Capture (no product code)

| ID | Task | Depends | Deliverable | Acceptance |
|---|---|---|---|---|
| P0-01 | Verify toolchain (Node/npm versions), verify `reengine-cli` availability via `npm view`, record platform facts | — | `docs/contracts/environment.md` | Fallback name chosen if taken (A2) |
| P0-02 | Install `rea-agents` in a scratch dir; capture `rea --help`, `rea providers --json`, `rea capabilities --json`, `rea mcp doctor --json`, `rea doctor --provider <id> --json` for each detectable provider, and `rea analyze-javascript-application <fixture> --json` | P0-01 | `test/fixtures/rea/<ver>/cli/*` + README | SK-01 complete; commands and exit codes recorded |
| P0-03 | Write `scripts/capture-rea-contract.ts` (MCP SDK client → spawn `rea mcp`): record `initialize`, `tools/list` (paginated), `prompts/list`, `resources/list`, and one successful + one failing tool call on the JS fixture | P0-02 | `test/fixtures/rea/<ver>/mcp/*` | Script is re-runnable, deterministic modulo timestamps (normalized) |
| P0-04 | Classify every REA tool (risk, readOnly, longRunning, pathArgs, openWorld) | P0-03 | `docs/contracts/rea-tools.md` + draft policy data | 100% of catalog classified (FR-REA-07) |
| P0-05 | Extract REA's agent workflow instructions (skill/MCP prompts) from the installed package/docs; vendor with MIT notice | P0-03 | `docs/contracts/rea-workflow-source.md` + `THIRD_PARTY_NOTICES.md` draft | Provenance + license recorded |
| P0-06 | Fetch current official docs for OpenAI Chat Completions streaming, Anthropic Messages streaming, Gemini `streamGenerateContent`; capture sample streams (live if keys exist, else documented examples marked synthetic) incl. parallel tool calls and error bodies | P0-01 | `docs/contracts/wire-{openai-compatible,anthropic,gemini}.md` + fixtures | Covers every behavior in integrations §1.7 |
| P0-07 | Ink compatibility spike (≤ 150 lines, **discarded after**): `<Static>` + live region + resize + bracketed paste + Windows Terminal check; record findings and chosen Ink/React versions | P0-01 | `docs/contracts/ink-spike.md` | Flicker/duplication behavior documented |
| P0-08 | Pin all runtime/dev dependency versions (`npm view` each; sizes, licenses, install scripts) | P0-07 | `docs/contracts/dependencies.md` | R-013/R-071/R-072 satisfied |
| P0-09 | UX parity read of Gemini CLI/Crush/Claude Code *public docs only* → checklist of behaviors to match; note licenses | — | `docs/contracts/ux-reference.md` | No code copied; licenses recorded |
| P0-10 | Gate report G0 + request sign-off for A1–A5 | all | `docs/gates/G0.md` | Architect approves |

### Phase 1 — Foundation (WS-A, WS-G)

| ID | Task | Depends | Acceptance |
|---|---|---|---|
| P1-01 | Scaffold repo: `package.json` (§deployment 2), tsconfig, tsup, vitest, ESLint (incl. custom rules `no-ui-literals`, `no-console`, banned-TODO), Prettier, dependency-cruiser, knip, Changesets, git hooks | G0 | `npm run verify` runs and passes on empty-but-structured tree |
| P1-02 | CI workflows (lint/type/test matrix 3 OS × Node 22/24, pack check, audit) | P1-01 | CI green on a PR |
| P1-03 | `util/`: result, AppError hierarchy, ids (sortable), abort helpers, clock, redactor, pino logger (file, redacting) | P1-01 | NFR-MAINT; redaction tests (FR-SEC-04) |
| P1-04 | `platform/`: paths (XDG/Windows), terminal capability detection, spawn/kill-tree, scrubbed env builder | P1-03 | Cross-OS tests (SK-12) |
| P1-05 | `config/`: Zod schema, JSONC loader, layering, env/flag overlay, path-precise errors, migrations, comment-preserving writer, JSON-Schema emitter | P1-03,P1-04 | FR-CFG-01/02/04; schema↔reference test |
| P1-06 | `config/secrets`: `env:`/`file:`/`keychain:` resolvers, literal policy | P1-05 | FR-SEC-01 |
| P1-07 | Folder trust store + gated-subset hashing | P1-05 | FR-CFG-03; security test 3 |
| P1-08 | `core/contracts.ts` exactly per specs §4 + type tests | P1-03 | Reviewer sign-off (G1.5) |
| P1-09 | CLI skeleton (commander), exit-code mapper, `version`, `config *`, `completion`, bin shim with Node gate; lazy imports | P1-05 | `--version` does not load Ink (test) |

### Phase 2 — Providers (WS-B)

| ID | Task | Depends | Acceptance |
|---|---|---|---|
| P2-01 | `providers/sse.ts` + fuzz chunking tests | G1.5 | 100% branch |
| P2-02 | `HttpClient`: proxy/CA, timeouts, retry/backoff, error mapping, abort | P2-01 | FR-PRV-08/13 |
| P2-03 | `openai-compatible` adapter incl. all `compat` flags | P2-02 | contract suite |
| P2-04 | `anthropic` adapter (+ thinking blocks, cache markers S) | P2-02 | contract suite |
| P2-05 | `gemini` adapter | P2-02 | contract suite |
| P2-06 | Registry, presets, model-ref parsing, discovery, capability resolution, history replay normalization | P2-03..05 | FR-PRV-04..07 |
| P2-07 | `test/mocks/mock-llm`: scripted scenarios for all three shapes (text, tools, parallel, errors, slow, drop) on ephemeral ports | P2-01 | Used by all later suites |
| P2-08 | Shared parametrized provider contract suite | P2-07 | Green for 3 adapters |
| P2-09 | `providers list/presets/add/remove/test`, `models` commands | P2-06,P1-09 | Capability probe output |

### Phase 3 — Core, Tools, Permissions (WS-C, WS-D)

| ID | Task | Depends | Acceptance |
|---|---|---|---|
| P3-01 | Session store (JSONL) + content-addressed artifact store + crash-recovery reader | G1.5 | FR-SES-01; kill -9 test |
| P3-02 | Token estimator + calibration + context manager (prune) | P3-01 | specs §6 |
| P3-03 | Prompt builder + bundled modules + memory file loader; snapshot tests | G1.5 | FR-AGT-06 |
| P3-04 | Permission engine (modes, rules grammar, taint, path guard) + exhaustive truth-table tests | G1.5 | security §4 |
| P3-05 | Built-in tools: `read_file list_dir glob grep` | P3-04 | FR-TOOL-01 |
| P3-06 | `write_file edit_file` with diff preview + atomic write | P3-04 | FR-TOOL-02 |
| P3-07 | `shell` tool (scrubbed env, kill-tree, caps) | P1-04,P3-04 | FR-TOOL-03 |
| P3-08 | `todo_write`, `artifact_read`, `artifact_search`, spill pipeline | P3-01 | FR-TOOL-04..06 |
| P3-09 | Tool executor: Ajv validation, scheduling (parallel reads), progress, abort, result shaping | P3-05..08 | specs §5.6–5.9 |
| P3-10 | Agent loop + events + loop guard + cancellation invariants | P2-08,P3-09 | FR-AGT-01/02/04; invariant property tests |
| P3-11 | Compaction (prune + summarize) | P3-10 | FR-AGT-03; evidence preserved |
| P3-12 | Headless renderer + `run` + stdin context + output formats + exit codes + `sessions` + resume | P3-10 | FR-CLI-02..04,08; golden files |
| P3-13 | e2e: headless multi-step conversation vs mock LLM, with permission denial and cancel | P3-12 | Gate G3 |

### Phase 4 — MCP & REA (WS-E)

| ID | Task | Depends | Acceptance |
|---|---|---|---|
| P4-01 | MCP manager: stdio + HTTP (+SSE S), naming, schema ingest, annotations mapping | G3 | FR-MCP-01..04 |
| P4-02 | Calls: progress, cancellation, timeouts-reset, list_changed, crash/reconnect | P4-01 | FR-MCP-05/06 |
| P4-03 | `test/mocks/mock-mcp` (SDK server in-process + subprocess variants; slow/progress/crash/poisoned-description tools) | P4-01 | Used by suites |
| P4-04 | Prompts bridge (`/mcp__…`), resources (S) | P4-02 | FR-MCP-07/08 |
| P4-05 | REA resolver + supervisor + ring buffer + orphan-free shutdown | P0-03 | FR-REA-01; kill-parent test |
| P4-06 | Engine doctor + `engine *` commands | P4-05 | FR-REA-03 |
| P4-07 | Targets + path-arg guard integration | P3-04,P4-05 | FR-REA-05 |
| P4-08 | `rea-tool-policy.ts` from P0-04 + policy-completeness test | P4-05 | FR-REA-07 |
| P4-09 | Evidence adapters (REA + generic) against fixtures | P0-03 | FR-REA-06 |
| P4-10 | `mcp add/list/remove/enable/disable/doctor` | P4-02 | FR-MCP-09/10 |
| P4-11 | REA drift test (`contract:rea`) + nightly workflow | P4-05 | FR-REA-09 |
| P4-12 | Real-REA e2e on JS fixture app (headless) | P4-09 | Gate G4 |

### Phase 5 — UI (WS-F)

| ID | Task | Depends | Acceptance |
|---|---|---|---|
| P5-01 | Theme engine: schema, loader, `extends`, 5 built-ins, downsampling, validation, ANSI map, `colorOverrides` | G1.5 | FR-UI-01/02 |
| P5-02 | App shell, event→state reducer, Static/live split, terminal restore | P5-01 | R-062/R-063 |
| P5-03 | Transcript components + Markdown + CodeBlock + sanitizer | P5-02 | ui §5 tests |
| P5-04 | ToolCard + ActivityLane + progress | P5-03 | FR-UI states |
| P5-05 | Composer: multiline, history, paste chips, `@` and `/` completion, queue-one | P5-02 | ui §4 |
| P5-06 | PermissionPrompt + DiffView | P5-04 | FR-UI-08 |
| P5-07 | Overlays: ModelPicker, ThemePicker(live), SessionPicker, Help | P5-05 | — |
| P5-08 | StatusBar, EngineChip, Inspector, DetailViewer (alt-screen) | P5-04,P4-05 | FR-UI-09/10, FR-REA-02 |
| P5-09 | Keybinding engine + `keybindings.json` + collision tests | P5-05 | FR-UI-04 |
| P5-10 | SetupWizard + `/config` editor + `setup` command | P5-07,P2-09 | J1 journey |
| P5-11 | `theme export --terminal …` (7 targets) + golden tests | P5-01 | FR-UI-06 |
| P5-12 | Plain mode, narrow-width layout, resize handling | P5-04 | FR-UI-11/12 |
| P5-13 | Wire real app: Runtime → UI end-to-end (interactive) | P5-02..08,G4 | Gate G5 |

### Phase 6 — RE polish (WS-F + WS-E)

| ID | Task | Acceptance |
|---|---|---|
| P6-01 | Evidence list/detail UI, status glyph+color, limitations, raw artifact jump | FR-REA-06, FR-UI |
| P6-02 | Assembly/pseudocode tokenizer + highlighting (x86/ARM/generic) fixtures | FR-UI-07 |
| P6-03 | Artifact spill UX (`artifact_id` hints, Detail Viewer deep link) | FR-TOOL-06 |
| P6-04 | `/report` + `report` command (deterministic Markdown from session) | FR-REA-11 golden |
| P6-05 | Auto-snapshot injection | FR-REA-10 |
| P6-06 | `REENGINE.md` loader integration + `/init` | FR-AGT-06 |
| P6-07 | First-run responsible-use gate | security §8 |

### Phase 7 — Hardening & Release (WS-G)

| ID | Task | Acceptance |
|---|---|---|
| P7-01 | Security review (SK-14) + all security acceptance tests | security §9 |
| P7-02 | Perf verification vs budgets (`precise-scale-index.md` §4) | Benchmarks recorded |
| P7-03 | Manual QA matrix: {macOS, Linux, Windows} × {Terminal.app/iTerm, GNOME/kitty, Windows Terminal} × {truecolor, 256, NO_COLOR} | Recorded matrix |
| P7-04 | User docs (`docs/user/*`, README, troubleshooting, provider guides), `--help` examples tests | FR docs |
| P7-05 | Packaging, install-from-tarball tests (3 OS), Docker image + smoke | deployment §3–5 |
| P7-06 | Release pipeline dry-run → `1.0.0-rc.1` on `next` | deployment §7 |
| P7-07 | Execute `acceptance-checklist.md`; fix; tag `v1.0.0` | Gate G7 |

## 6. Interface handoff rules

- Cross-workstream calls go through the interfaces in `contracts.ts` or the module `index.ts` only.
- A workstream publishes a **fake** of its interface (`test/fakes/*`) at the same time as the real implementation so dependents can proceed in parallel.
- Any interface change = Change Proposal; dependents are notified in `docs/PROGRESS.md`.

## 7. Per-task protocol

1. Read task + referenced specs. 2. Write a 5–10 line plan in `docs/progress/<id>.md`. 3. Implement with tests. 4. `npm run verify`. 5. Record evidence. 6. Commit (Conventional). 7. Update `docs/PROGRESS.md`. 8. If the task changed behavior users see → update `docs/user/`.
