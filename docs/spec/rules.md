# rules.md — Hard Rules

Keywords **MUST**, **MUST NOT**, **SHOULD** are normative. A violation of a MUST/MUST NOT is a defect regardless of whether tests pass. Rules are numbered; reviewers cite them (`violates R-031`).

## A. Process

- **R-001** MUST read the relevant spec section before starting a task and cite requirement IDs (FR/NFR) in the commit body.
- **R-002** MUST NOT start a phase before the prior gate report is committed (`docs/gates/G<n>.md`) and approved by the Architect/Reviewer role.
- **R-003** MUST work in vertical, reviewable increments: ≤ 400 changed lines per commit where feasible; one logical change per commit.
- **R-004** MUST write tests *with* the code, not afterwards. A PR without tests for new behavior is rejected.
- **R-005** MUST run `npm run verify` before every commit and paste the real summary into `docs/progress/<task-id>.md`.
- **R-006** MUST NOT claim a task done, a test passing, or a command working unless it was actually executed and the output is recorded.
- **R-007** MUST raise a Change Proposal (template in `precise-scale-index.md`) for: contract changes, new runtime deps, security-default changes, scope changes, spec contradictions.
- **R-008** MUST keep docs in sync in the same commit (config reference, JSON schemas, user docs, ADR).
- **R-009** MUST NOT leave `TODO`, `FIXME`, `XXX`, commented-out code, placeholder strings ("lorem", "foo"), or stubbed functions in `src/`. CI greps for them.
- **R-010** MUST prefer deleting code to adding abstractions. No speculative generality.

## B. Truthfulness about the outside world

- **R-011** MUST NOT assume REA tool names, argument names, JSON shapes, CLI flags, or error formats. They come from `test/fixtures/rea/<version>/` and `docs/contracts/`.
- **R-012** MUST NOT assume provider wire formats. They come from `docs/contracts/wire-*.md` and fixtures captured from official docs/real responses.
- **R-013** MUST verify every npm package name and version with `npm view` before adding it; record in `docs/contracts/dependencies.md`.
- **R-014** MUST NOT invent URLs, flags, environment variables, or model IDs in user-facing text. Examples in docs MUST be marked illustrative.
- **R-015** When an external fact cannot be verified, MUST fail closed (feature disabled with a clear message) rather than guess.

## C. Architecture

- **R-020** MUST respect layer boundaries (`specs.md` §3.2); `npm run deps:check` MUST pass.
- **R-021** `src/core/contracts.ts` is frozen after G1.5; MUST NOT be edited outside an approved Change Proposal.
- **R-022** MUST NOT import `ink`/`react` outside `src/ui` and `src/cli` UI entry points.
- **R-023** `core` MUST be runnable and testable headless with fake providers and fake tools.
- **R-024** Composition MUST happen only in `src/app`; no module constructs its own collaborators via singletons or globals.
- **R-025** MUST use dependency injection for clock, filesystem roots, process spawner, and HTTP client in anything that needs deterministic tests.

## D. TypeScript & code quality

- **R-030** `tsconfig`: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `verbatimModuleSyntax`, `isolatedModules`.
- **R-031** MUST NOT use `any`, `@ts-ignore`, `@ts-expect-error` (without linked issue and test), non-null `!`, or unsafe `as` casts across trust boundaries. Use Zod/Ajv parsing.
- **R-032** MUST validate all external input (config files, env, CLI args, provider responses, MCP results, session files, REA JSON) at the boundary and convert to typed values or typed errors.
- **R-033** Errors MUST be typed (`AppError` hierarchy with `code`, `message`, `remedy?`, `cause?`). MUST NOT swallow errors; catch blocks either handle meaningfully, rethrow with context, or convert to a `Result`.
- **R-034** Files ≤ 400 lines; functions ≤ 60 lines and cyclomatic complexity ≤ 15 (ESLint-enforced). Split by responsibility, not arbitrarily.
- **R-035** MUST NOT use `console.*`. Use `logger` (file) or UI events.
- **R-036** All async I/O MUST accept and honor an `AbortSignal`. No fire-and-forget promises (`no-floating-promises` on).
- **R-037** MUST NOT use synchronous fs/child_process APIs outside startup config loading and tests.
- **R-038** Parsing JSON from the network or model MUST go through a single validated helper; MUST NOT use regex to parse JSON or structured output.
- **R-039** ESM only; no `require`, no default exports in `src/` (except where a framework mandates).
- **R-040** MUST NOT mutate function arguments or shared state in adapters/reducers; reducers are pure.

## E. Security (see `security-and-permissions.md`)

- **R-050** Permission default MUST remain `ask`. MUST NOT add code paths that auto-approve based on model output.
- **R-051** MUST NOT log secrets, prompts, completions, file contents, or tool args at `info` or above.
- **R-052** MUST NOT pass `process.env` wholesale to child processes; use the scrubbed environment builder.
- **R-053** MUST NOT build shell commands by string concatenation of untrusted input; use argv arrays.
- **R-054** MUST sanitize untrusted text before rendering (ui §5.4).
- **R-055** MUST NOT add network calls beyond the allowlist in security §6.
- **R-056** MUST NOT execute, import, or `eval` content from analyzed targets, model output, or MCP servers except via the sanctioned tool interfaces.
- **R-057** MUST NOT copy code, prompts, or assets from Claude Code or any source without a verified compatible license and attribution in `THIRD_PARTY_NOTICES.md`.

## F. UI

- **R-060** MUST NOT hard-code colors, border characters, glyphs, or spacing outside `src/ui/theme/` (lint rule).
- **R-061** MUST NOT write to stdout/stderr directly while the TUI is mounted.
- **R-062** MUST restore terminal state on every exit path (tested).
- **R-063** Live region MUST contain only in-flight items; finished items graduate to `<Static>`.
- **R-064** MUST NOT capture the mouse by default.
- **R-065** Every status MUST be conveyed by text/glyph in addition to color.

## G. Dependencies & build

- **R-070** Runtime deps pinned exactly; lockfile committed; `npm ci` in CI.
- **R-071** MUST NOT add a dependency for something achievable in ≤ 50 lines of clear code, or that is on the approved list's functional overlap.
- **R-072** MUST NOT depend on packages with install scripts that download binaries, unless approved (REA's own tooling excepted and documented).
- **R-073** `knip` MUST report no unused files/exports/dependencies.
- **R-074** The published tarball MUST contain only `dist/`, `bin/`, `schemas/`, `README.md`, `LICENSE`, `THIRD_PARTY_NOTICES.md`, `CHANGELOG.md` (enforced by `scripts/check-pack.ts`).

## H. Testing

- **R-080** Tests MUST be deterministic: no real network, real LLM, wall-clock sleeps, or ordering assumptions. Use mock servers, fake timers, fixtures.
- **R-081** MUST NOT delete, skip (`.skip`), or loosen a failing test to get green. Fix the code or file a Change Proposal.
- **R-082** Coverage thresholds (testing doc §6) MUST NOT be lowered.
- **R-083** Every bug fix MUST add a regression test that fails before the fix.
- **R-084** Fixtures MUST be captured from real/official sources and redacted; hand-written fixtures are labeled `synthetic` and limited to edge cases.

## I. Git & release

- **R-090** Conventional Commits; MUST NOT force-push shared branches or rewrite published history.
- **R-091** Each gate is tagged `gate-G<n>` on the passing commit.
- **R-092** MUST NOT publish to npm outside the release workflow.
- **R-093** Version bumps and changelog via Changesets only.
