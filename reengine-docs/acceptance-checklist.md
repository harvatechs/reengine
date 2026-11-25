# acceptance-checklist.md — v1.0.0 Go/No-Go

Every box needs **evidence** (command output, test name, or file path) recorded in `docs/gates/G7.md`. One unchecked box = **no-go**. "N/A" is not allowed without Architect sign-off.

## 1. Functional (from user-requirements.md)

- [ ] All **M** requirements in §2.1–2.8 verified; each FR ID mapped to ≥ 1 passing test (traceability table `docs/gates/G7-traceability.md`).
- [ ] **S** requirements shipped or formally descoped following the shedding order in `precise-scale-index.md` §5, with entries in the changelog "Not in 1.0".
- [ ] Journey J1 executed on a clean VM per OS: install → first run → first analysis (JS target) in ≤ 5 minutes, timed.
- [ ] J2 (JS/Electron investigation with evidence and `/report`), J3 (native with and without an engine installed), J4 (model swap mid-session), J5 (CI headless), J6 (theme + exporter) each demonstrated.

## 2. Providers & models

- [ ] Shared contract suite green for `openai-compatible`, `anthropic`, `gemini`.
- [ ] All 12 presets parse and are documented.
- [ ] Manual live smoke (recorded) against ≥ 3 distinct backends: one hosted first-party, one router (e.g. OpenRouter), one local (Ollama or LM Studio).
- [ ] A never-before-seen OpenAI-compatible server configured purely via config works (FR-PRV-05).
- [ ] Cancel ≤ 500 ms, retry/backoff, idle-timeout behaviors proven by fault-injection tests.

## 3. REA & MCP

- [ ] Real pinned REA: handshake, doctor, JS fixture analysis, clean shutdown with **0 orphans** on all 3 OS.
- [ ] `contract:rea` clean; policy table covers 100% of live catalog; exec/network-class tools always ask.
- [ ] Evidence UI shows observed / inferred / unknown with limitations; raw artifacts retrievable; generic fallback renders an unknown shape.
- [ ] Degradation matrix (integrations §3.10) walked through manually, each row recorded.
- [ ] Third-party MCP server (stdio and HTTP) added via `mcp add`; progress, cancel, list_changed verified.
- [ ] MCP prompts invocable as slash commands.

## 4. UI & customization

- [ ] All five built-in themes pass token-coverage test; `theme validate` contrast report reviewed.
- [ ] A user theme with `extends` and `colorOverrides` works with no source edits.
- [ ] Keybinding remap works; reserved-key and collision tests green.
- [ ] `theme export --terminal` golden tests ×7; output manually loaded in ≥ 3 real terminals.
- [ ] Resize, 60-column, `NO_COLOR`, 16-color, `--plain`, and non-TTY behaviors verified.
- [ ] Terminal restored correctly after: normal exit, Ctrl+C, SIGTERM, unhandled exception (tested).
- [ ] No hard-coded colors/glyphs/borders outside `ui/theme` (lint clean).

## 5. Security & privacy

- [ ] All 10 security acceptance tests (security §9) pass.
- [ ] SK-14 review recorded for G7 with zero open S3+ findings.
- [ ] Seeded-secret scan clean for logs, sessions, doctor, error output.
- [ ] Network-egress test confirms allowlist only.
- [ ] `bypass` mode requires flag + env var; ignored from project config.
- [ ] Folder-trust gate verified with a hostile sample repo.
- [ ] Responsible-use notice shown on first run and acknowledgement persisted.
- [ ] `npm audit --omit=dev --audit-level=high` clean; licenses reviewed; `THIRD_PARTY_NOTICES.md` complete (incl. vendored REA workflow text).

## 6. Quality & performance

- [ ] `npm run verify` green on {ubuntu, macOS, windows} × {Node 22, 24}.
- [ ] Coverage thresholds met (testing §6); no skipped tests; two shuffled runs green.
- [ ] Budgets in `precise-scale-index.md` §4 measured and recorded in `docs/perf/` — **none** at S2/S3 levels.
- [ ] `grep -RE "TODO|FIXME|XXX" src` empty; `grep -R "console\." src` empty; no `any`/`@ts-ignore` in `src`.
- [ ] Layer lint (`deps:check`) and `knip` clean.

## 7. Packaging & release

- [ ] `pack:check` passes; tarball contents match whitelist; unpacked size ≤ 25 MB.
- [ ] Tarball installed into a clean prefix and smoke-tested on all 3 OS.
- [ ] Docker image built, non-root, smoke-tested; usage example in README executed verbatim.
- [ ] `1.0.0-rc.N` published to `next` with provenance and installed from the registry on 3 OS.
- [ ] Release workflow dry-run succeeded; tag/version/gate-report guard verified.
- [ ] Rollback rehearsal performed (deprecate + dist-tag) on the rc.

## 8. Documentation

- [ ] README quickstart executed verbatim on a clean machine.
- [ ] `docs/user/`: install, first run, providers (per preset), MCP, engine/REA guide (with provider install pointers), permissions & safety, themes & terminal profile, headless/CI, troubleshooting, reference (CLI, exit codes, schemas).
- [ ] Every `--help` example tested; config reference ↔ schema parity test green.
- [ ] `SECURITY.md`, `CONTRIBUTING.md`, issue templates, `CHANGELOG.md` present.
- [ ] ADRs current; Change Proposals closed; no contradictions between spec docs (checked and recorded).

## 9. Sign-off

| Role | Name | Date | Decision |
|---|---|---|---|
| Architect/Reviewer | | | |
| QA | | | |
| Human owner | | | |

Tag `v1.0.0` only after all three sign.
