# guidelines.md — Common Engineering Guidelines

`rules.md` says what is forbidden/required. This file says *how we normally write things here*. When a guideline and a rule conflict, the rule wins.

## 1. Style and naming

- Formatting: Prettier (`printWidth 100`, single quotes, trailing commas `all`, semicolons). Never hand-format.
- Files: `kebab-case.ts`; one primary export per file named like the file; tests colocated by mirror path under `test/` (`src/core/permissions.ts` → `test/unit/core/permissions.test.ts`).
- Types/interfaces/classes `PascalCase`; functions/variables `camelCase`; constants `SCREAMING_SNAKE_CASE` only for true constants; enum-like unions use string literal unions, not TS `enum`.
- Names describe domain intent: `resolveReaEntry`, not `getPath2`. Booleans read as predicates: `isReadOnly`, `hasEvidence`.
- No abbreviations except universal (`id`, `url`, `cwd`, `env`, `mcp`).
- Exports: named only. `index.ts` barrels only at module roots, and only re-exporting the public surface (layer rules apply to deep imports).

## 2. Error handling

- Use `AppError` subclasses in `src/util/errors.ts`: `ConfigError`, `ProviderError` (contract), `McpError`, `EngineError`, `PermissionError`, `ToolError`, `SessionError`, each with a stable `code` string (`CONFIG_INVALID`, `ENGINE_UNAVAILABLE`, …).
- Boundaries return typed results: parsers return `Result<T, AppError>` (`{ok:true,value}|{ok:false,error}`); internal invariants may throw `InvariantError` (bug, not user error).
- User-visible errors have `message` (what), optional `remedy` (do this), `docs` (anchor). The CLI maps error classes to exit codes in one place (`cli/exit.ts`).
- Never expose stack traces in default UI; stacks go to the log. `--debug` prints them to the log path notice.
- Tool failures are **data** to the model (`isError: true` result), not exceptions that kill the loop.

## 3. Async, cancellation, resources

- Pass `AbortSignal` explicitly; derive child signals with `AbortSignal.any`. Every long operation checks `signal.aborted` at await boundaries and cleans up in `finally`.
- Own your resources: whoever spawns a process/opens a stream registers a disposer with the app's `ResourceScope`; shutdown closes scopes in reverse order with a hard 5 s cap.
- Prefer `AsyncIterable` for streams. Never buffer unbounded data; bound by bytes and by count, and test the bound.
- Timers: inject a `Clock`; tests use fake timers.

## 4. Logging

- `logger.child({ module: 'engine' })` per module; structured fields, short messages, no interpolated secrets. Levels: `error` (action failed, needs attention), `warn` (degraded), `info` (lifecycle), `debug` (diagnostics), `trace` (bodies, redacted).
- A UI-visible condition emits an `AgentEvent`/notice; logging alone is not user communication.

## 5. Validation at boundaries

- External → Zod (config, session, REA JSON, doctor outputs, provider JSON) or Ajv (tool argument schemas supplied at runtime).
- Use `.strict()` for our own file formats (reject unknown keys with a helpful message), `.passthrough()` for third-party payloads we only partially understand.
- Convert once at the edge; interior code works with validated, typed values.

## 6. Module design

- Small, cohesive modules; pure functions for logic, thin classes only for lifecycle (supervisors, connections, stores).
- Public API of each module is a short interface in its `index.ts`; internals are not importable by other layers (dependency-cruiser).
- Prefer composition over inheritance; the only intended inheritance is `AppError`.
- Reducers (UI state, session replay) are pure and exhaustively `switch` on event `type` with a `never` check.

## 7. Comments and docs

- Comments explain **why** (constraints, protocol quirks, links to `docs/contracts/*`), never what the code plainly says.
- Public functions and types get TSDoc one-liners where the name isn't enough. Contract files (`contracts.ts`) are documented thoroughly.
- Non-obvious decisions → ADR in `decisions.md` (or `docs/adr/`), referenced by number in the code comment.

## 8. Testing guidelines

- Arrange/Act/Assert; one behavior per test; table-driven tests for matrices (permissions, compat flags, exit codes).
- Test names state behavior: `it('retries 429 before first byte and honors Retry-After')`.
- Prefer integration tests with real parsers over mocks of our own code; mock only the process boundary (network, child process, clock).
- Property tests (fast-check is **not** on the approved list — implement bounded randomized loops with a seeded PRNG in `test/util/prng.ts`) for sanitizers, SSE chunking, path guard.
- Snapshot tests only for rendered UI frames and prompt text; snapshots are reviewed like code.

## 9. Git workflow

- Trunk-based with short-lived branches `feat/<id>-slug`, `fix/<id>-slug`, `chore/…`.
- Conventional Commits: `feat(providers): add anthropic cache control (FR-PRV-11)`. Body: *what/why*, requirement IDs, evidence path.
- PR template checklist: requirements covered · tests added · `verify` output · docs updated · security impact · rules touched.
- Rebase before merge; squash only trivial fixup chains. Never merge red CI.

## 10. User-facing text and docs

- Present tense, second person, concrete commands in code blocks that were actually run.
- Every CLI command has `--help` with at least one example; examples are exercised by a test that runs them against the mock stack.
- Changelog entries describe user impact, not implementation.

## 11. Performance habits

- Measure before optimizing: use `scripts/bench-*.ts` (startup, render, resume) and record in `docs/perf/`.
- Lazy `import()` heavy modules on the path that needs them.
- Avoid O(n²) over message history; maintain incremental token counts.

## 12. Dependency hygiene

- Before adding: check size (`npm view <pkg> dist.unpackedSize`), maintenance activity, license, install scripts, transitive count. Record the decision in `docs/contracts/dependencies.md`.
- Wrap third-party libraries behind a small internal module so they can be replaced (Ink components, `marked`, `execa`, keyring).
