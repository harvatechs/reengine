# skills.md — Builder Skills (Repeatable Playbooks)

Each skill is a checklist the Builder Agent follows when a task matches its trigger. Skills do not override `rules.md`. Every skill ends with: **run `npm run verify` → record evidence in `docs/progress/<task-id>.md`**.

---

## SK-01 · Capture an external contract (REA or provider)
**Trigger:** any work depending on REA output, a provider wire format, or a new third-party API.
1. State the question precisely (*"What does `rea providers --json` print?"*).
2. Obtain ground truth: run the real command against the pinned install, or fetch the current official docs; for provider streams record a real (redacted) or documented sample.
3. Save raw artifacts under `test/fixtures/<area>/<version>/` with a `README.md` stating command, date, version, redactions. Mark synthetic ones `synthetic`.
4. Write `docs/contracts/<name>.md`: facts only (fields, types, optionality observed, error shapes), each with a pointer to a fixture.
5. Implement parser with Zod (`passthrough` for unknown fields) + tests against fixtures.
6. Add a **drift test** that re-reads fixtures through the parser (and, for REA, `contract:rea`).

## SK-02 · Add a model provider preset (no new code path)
1. Confirm the service speaks one of the three adapter types (use `providers test` capability probe against it, or fixtures).
2. Add the preset entry in `providers/presets.ts` (`id,label,type,baseUrl,authEnvVar,compat,keyUrl,notes`).
3. Set `compat` flags from observed behavior, not assumption; add fixture if the service has quirks.
4. Run the preset-schema test and the provider contract suite against the mock server configured with the preset's flags.
5. Document in `docs/user/providers.md` (one row).

## SK-03 · Add a new adapter type (rare; needs Change Proposal)
1. File Change Proposal (S3): justification, wire doc links.
2. SK-01 for the wire format. 3. Implement `ModelProvider` in `providers/<type>.ts` (stream only through the shared `HttpClient` + `sse.ts`).
4. Make it pass the **shared contract suite** (`test/integration/providers/contract.ts`) — the suite must be parametrized, not copy-pasted.
5. Extend config schema union + `config-reference.md` + generated JSON schema.

## SK-04 · Add a built-in tool
1. Define input JSON Schema; write `describe()` for permission prompts.
2. Classify: `risk`, `readOnly`, `destructive`, `openWorld`, `pathArgs`.
3. Implement `execute` with `AbortSignal`, bounded I/O, path-root checks via the shared guard.
4. Register in `tools/registry.ts`; add to plan-mode visibility matrix.
5. Tests: happy path, abort mid-run, bound enforcement, path escape, permission truth-table row, spill behavior.
6. Update `docs/user/tools.md` and the system prompt tool rules if behavior guidance is needed.

## SK-05 · Classify a new/changed REA tool
1. Run `npm run contract:rea`; read the diff.
2. For each new tool: read its description + input schema fixture; decide `risk`, `readOnly`, `longRunning`, `pathArgs`, `openWorld` per integrations §3.5 (runtime/interactive/device/network ⇒ `exec`/`network`, always ask).
3. Update `engine/rea-tool-policy.ts` + `docs/contracts/rea-tools.md`.
4. Update/add evidence-adapter fixtures if output shape changed; run adapter tests.
5. Commit fixtures + policy + adapter + changelog note **together**.

## SK-06 · Bump REA
1. `npm view rea-agents versions` → choose target; read its release notes/CHANGELOG.
2. Branch `chore/rea-<ver>`; install exact; `npm run contract:rea`.
3. Apply SK-05. Run REA integration tests (JS fixture analysis) and doctor tests.
4. Update `contract.ts` `{pinnedVersion,minVersion}` and `THIRD_PARTY_NOTICES.md`.
5. Merge only with green CI and a changeset (`patch` unless user-visible behavior changes).

## SK-07 · Add a config key
1. Add to Zod schema with default + `.describe()` text. 2. Update `config-reference.md` row (same commit).
3. `npm run schema:gen`. 4. Add loader/merge/precedence test. 5. If it's trust-gated or secret-bearing, update the gating list and redaction tests. 6. If behavior changes for existing users, add a migration and bump nothing silently.

## SK-08 · Add or change a theme token
1. Add token to `theme/schema.ts` and `ui-design-spec.md` §6. 2. Define in **all five** built-in themes. 3. Use it via `useTheme()`; no literals. 4. Update ANSI map + terminal exporters. 5. Run the token-coverage test and the golden export tests.

## SK-09 · Add a slash command
1. Register in `ui/commands/registry.ts` with `name, summary, args, run(ctx)`; commands are pure UI/app actions, not business logic. 2. Appear in palette + `/help` automatically (test asserts). 3. Add doc row in `ui-design-spec.md` §9. 4. Test with `ink-testing-library`.

## SK-10 · Debug Ink flicker / duplication / garbled frames
1. Reproduce with `scripts/ui-repro.tsx` under `FORCE_COLOR=3` in a PTY (`script`/Windows Terminal).
2. Check: live region height changing every frame? text deltas unbatched? items mutated after `<Static>`? width miscounted (CJK/emoji)? stray stdout writes?
3. Fix the cause (not by adding `clear()` hacks). Add a frame-sequence test capturing lastFrame transitions.

## SK-11 · Make a flaky test deterministic
1. Identify nondeterminism source (timers, ports, ordering, FS timing, real network). 2. Inject clock/ports/ordering control; use ephemeral ports from the mock server helper; wait on events, not sleeps. 3. Run the test 200× locally (`vitest --repeat 200` style loop) before merging. Never `retry` as a fix.

## SK-12 · Cross-platform process work (spawn/kill/paths)
1. Use `execa`/spawn argv arrays; on Windows never rely on `.cmd` shims: spawn the Node entry file directly via `process.execPath` (this is why REA is resolved to its JS entry, integrations §3.2). 2. Kill trees: POSIX `detached` + negative pid; Windows `taskkill /pid <pid> /T /F`. 3. Paths via `node:path` and `platform/paths.ts` only; never hard-code `/`. 4. Add the test to the 3-OS CI matrix and verify it fails on a deliberately broken implementation.

## SK-13 · Write an ADR
`decisions.md` entry: Context · Decision · Alternatives (with why rejected) · Consequences · Revisit trigger. Number sequentially; link from code comments that rely on it.

## SK-14 · Security review pass (run at every gate)
Walk `security-and-permissions.md` §9 tests; grep for `console.`, `process.env`, `child_process`, `eval`, `new Function`, `any`; review new tools/adapters against threats T1–T10; record findings in `docs/gates/G<n>-security.md`.

## SK-15 · Release dry-run
Follow `deployment-and-release.md` §7: `npm pack`, `check-pack`, install tarball in clean temp prefix on each OS, run smoke script, run Docker smoke, confirm provenance step with `--dry-run`.

## SK-16 · Raise a Change Proposal
Use the template in `precise-scale-index.md` §6; stop affected work; wait for Architect decision; update spec docs in the same PR that implements the change.
