# testing-and-quality.md

Principle: **every behavior is provable without a real LLM, a real network, or a real REA install** — and *separately* proven against the real pinned REA in dedicated jobs.

## 1. Pyramid and tooling

| Layer | Tool | What | Runs |
|---|---|---|---|
| Unit | Vitest | Pure logic: permissions, config merge, SSE, token estimator, reducers, sanitizers, themes, exporters | every commit |
| Integration | Vitest + mock servers | Provider adapters ↔ mock LLM; MCP manager ↔ mock MCP; session store on tmp dirs; supervisor ↔ fake REA stand-in | every commit |
| Contract | Vitest | Shared provider suite ×3; REA fixtures through parsers/adapters; policy completeness | every commit |
| REA real | Vitest (`--project rea-real`) | Real pinned `rea-agents`: handshake, doctor, JS fixture analysis, shutdown | CI (3 OS) + nightly drift job |
| UI | `ink-testing-library` | Frames, key handling, state transitions, snapshots | every commit |
| E2E headless | Vitest spawning `dist/cli.js` | Whole binary vs mock LLM + mock MCP + temp `REENGINE_HOME` | CI |
| PTY smoke | scripted PTY (dev dependency approved in P0-08 only if prebuilds are reliable on all 3 OS; otherwise manual matrix) | Launch TUI, send prompt, assert terminal restore | CI optional / manual P7-03 |
| Live provider smoke | `REENGINE_E2E_LIVE=1` | Real provider keys, tiny prompts | manual, never CI |

## 2. Mocks and fakes (built in Phase 2/4, used everywhere)

- **`test/mocks/mock-llm`**: HTTP server on an ephemeral port speaking the three wire shapes; scenario DSL in plain TS objects: `text`, `toolCalls`, `parallelToolCalls`, `argsWhole`, `missingIds`, `delayMs`, `dropAfterBytes`, `status(429, retryAfter)`, `contextLengthError`, `pings`. Records every request for assertions.
- **`test/mocks/mock-mcp`**: built on the official SDK server; tools: `echo`, `slow_progress`, `crash_after`, `huge_output`, `poisoned_description`, `readonly_hint`, `destructive_hint`, `list_changed_trigger`; prompts and resources fixtures.
- **`test/mocks/fake-rea`**: tiny stdio MCP server that replays recorded REA catalog/results from fixtures (fast, deterministic) — distinct from the **real** REA jobs.
- **`test/fakes/*`**: fakes for each interface (provider, tool, clock, spawner) published with the real implementation (division §6).

## 3. Required test inventories

**Providers (per adapter, shared suite):** plain text stream; single tool call; parallel tool calls; whole-args; missing/duplicate ids; id remapping; `length` mid-args; empty args; usage reporting; 429 retry with `Retry-After`; 5xx retry; no retry after first byte; auth error mapping; context-length mapping; idle timeout; abort within 500 ms; proxy usage; custom headers/query params; cross-provider history replay.

**Core:** loop happy path; N-step tool chains; unknown tool; invalid args (Ajv) → error result; permission deny with feedback; abort at each state (streaming, pending permission, tool running) preserves the *every call has one result* invariant (randomized abort-point loop); loop-guard thresholds; max-steps; compaction triggers/prune/summarize with evidence preserved; context-length forced compaction; plan-mode tool visibility; resume equivalence (replay → same state).

**Permissions:** exhaustive truth table across `mode × risk × readOnly × tainted × rule-source × path-in-roots` (generated cases, asserted against an independent reference implementation written in the test).

**Tools:** each tool: happy, bounds, abort, path escape (including symlinks and `..`), binary detection, large-output spill; `shell`: timeout, tree kill, output cap, env scrub; `edit_file`: ambiguity, no-match, CRLF preservation, atomicity (simulated crash).

**Config:** layering/precedence matrix; array-replace vs rule-concat semantics; JSONC comment preservation on write; path-precise error messages (golden); migration; secret literal policy; trust hash invalidation; schema↔reference-doc parity.

**MCP/Engine:** lifecycle transitions; crash → restart ≤ 3 → failed; in-flight calls resolve with `MCP_CONNECTION_LOST`; progress and timeout-reset; cancellation notification; `list_changed` diffs; naming/collision/length rules; annotation mapping; **no orphans after parent kill**; resolver order (config > bundled > PATH > npx); doctor parsing with passthrough; policy table completeness vs catalog fixture; evidence adapters (fixture permutations, totality property tests); path-arg guard.

**UI:** theme resolution/`extends`/downsample/`NO_COLOR`; token coverage (components ⊆ schema; built-ins define all); lint rule `no-ui-literals` fixtures; reducer exhaustiveness; Static/live behavior (frame sequences); composer (paste chips, history, multiline, completions); permission prompt keys; status bar collapse by width; Detail Viewer scroll; plain mode output; sanitizer property tests; keybinding collision/reserved tests; exporter golden files ×7.

**CLI/E2E:** `--help` examples executed; each exit code reachable and asserted; `run` formats golden-tested (`text`, `json`, `stream-json`) incl. schema validation; piped stdin; non-TTY refusal; `--continue/--resume`; network-egress allowlist test; seeded-secret scan of logs/sessions/doctor/errors.

## 4. Fixtures policy

- Captured from real/official sources, **redacted**, stored with `README.md` (command, date, versions, redaction notes). Synthetic fixtures are labeled and limited to edge cases that real sources can't produce on demand.
- Normalization (timestamps, temp paths, pids) happens in one helper so diffs are meaningful.
- `npm run contract:rea` refreshes REA fixtures; refresh only in a dedicated PR (SK-05/06).

## 5. Determinism rules

No real sleeps (fake timers or event waits); ephemeral ports; unique temp `REENGINE_HOME` per test; tests must pass in any order and in parallel; a CI job runs the suite twice with `--sequence.shuffle`. New tests must pass 200 consecutive local runs (SK-11).

## 6. Coverage thresholds (enforced in `vitest.config.ts`)

| Scope | Lines | Branches |
|---|---|---|
| `src/core`, `src/providers`, `src/config`, `src/tools`, `src/engine`, `src/mcp` | 85% | 80% |
| `src/ui` | 60% | 50% |
| `src/cli`, `src/app` | 75% | 70% |

Thresholds only go up. Coverage is a floor, not evidence of quality; reviewers check that tests assert behavior.

## 7. Static quality gates (`npm run verify`)

`tsc --noEmit` (strict) · ESLint (typescript-eslint strict-type-checked + custom rules: no console, no UI literals, no TODO markers, no floating promises, complexity ≤ 15, max-lines 400) · Prettier check · dependency-cruiser layer rules · knip (unused) · schema generation drift check (`git diff --exit-code schemas/`) · unit + integration + contract tests with coverage · build + `scripts/check-pack.ts`.

## 8. Quality bars for user-facing behavior

- **Docs executable:** every command example in `docs/user/` and `--help` is tested against the mock stack.
- **Error quality:** a golden test per `AppError.code` verifying message, remedy, exit code.
- **Visual regression:** frame snapshots for `reengine-dark`, `mono`, plain mode at 60, 80, 120 columns.
- **Accessibility:** `NO_COLOR` and 16-color snapshots produce no information loss (status words/glyphs present).

## 9. Definition of Done (testing view)

A change is done when: new behavior has unit + (where I/O) integration tests; regression test exists for bug fixes; coverage thresholds hold; no skipped/flaky tests; `verify` green on 3 OS; fixtures/doc updates committed; security tests unaffected or extended.
