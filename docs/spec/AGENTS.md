# AGENTS.md — ReEngine CLI Operating Contract

You are building **ReEngine CLI**: a clean, minimal, flexible, production-grade terminal harness. It connects **any LLM or router** to **REA (Reverse Engineer Anything)** as a built-in, supervised MCP engine, with a customizable terminal UI inspired by Claude Code / Gemini CLI / OpenCode.

Full requirements live in `docs/spec/`. This file is the short version you must never forget.

## The 14 non-negotiables

1. **Read the spec before coding.** Order is in `README.md` §1. Re-read the relevant file before every task.
2. **Phase gates are law.** No product code before Gate G0. No phase starts before the previous gate passes (`division-of-work.md`).
3. **Evidence over claims.** "Done" means: `npm run verify` passed, tests exist for the new behavior, and real command output is logged in `docs/progress/<task-id>.md`.
4. **No pseudocode, no stubs, no `TODO` in merged code.** A feature is complete or it is not merged. Unfinished work goes behind a documented, tested "not available" error path, never a fake success.
5. **Never invent external facts.** REA tool names/JSON shapes, provider wire formats, flags, package names, and versions come from *captured fixtures or fetched official docs* — never memory. Unknown → investigate → record in `docs/contracts/`.
6. **Contracts are frozen.** `src/core/contracts.ts` changes only via an approved Change Proposal (severity S3).
7. **Layer boundaries are enforced** (`dependency-cruiser`). `core` never imports `ui`, `providers`, `mcp`, or `engine`.
8. **Strict TypeScript.** No `any`, no `@ts-ignore`, no non-null assertions in production code. Validate every external input with Zod/Ajv at the boundary.
9. **Security defaults are restrictive.** Permission default is *ask*. Secrets are references, never plaintext in logs/config output. Untrusted content (targets, web pages, MCP output) can never auto-trigger write/exec tools.
10. **Stdout belongs to the UI/protocol.** No `console.log` anywhere. Use the logger (file) and the UI event stream.
11. **One REA process per session**, supervised, never per tool call.
12. **Zero telemetry.** The only default network calls are to the user-configured model endpoints, user-configured MCP servers, and an opt-out npm registry version check.
13. **Clean-room discipline.** Claude Code is proprietary: take UX ideas only, never code, prompts, or assets. Check licenses before adapting anything (`decisions.md` ADR-014).
14. **When blocked or surprised: STOP, classify severity, follow `precise-scale-index.md`.** Do not "work around" a failing gate.

## Commands (after Phase 1 scaffold)

```bash
npm run verify        # typecheck + lint + deps boundaries + unused + unit + integration + build
npm run test:e2e      # headless e2e against mock LLM + mock MCP + REA fixtures
npm run contract:rea  # re-capture REA contract, diff against committed fixtures
npm run schema:gen    # regenerate JSON schemas (config, theme, keybindings)
```

## Definition of Done (every task)

- Acceptance criteria of the task ID in `division-of-work.md` met and demonstrated.
- Unit tests (and integration tests where I/O is involved) added; coverage thresholds not lowered.
- `npm run verify` green on the local OS; CI matrix green before merge.
- Docs updated *in the same commit*: `config-reference.md`/JSON schema for new keys, `docs/user/*` for user-visible behavior, ADR for any decision.
- No new dependency unless it is on the approved list in `specs.md` §2 or approved via Change Proposal.
- Conventional Commit message; one logical change per commit.

## Stop-and-ask triggers (S3+)

Contract mismatch with REA/provider reality · need to change `contracts.ts` · new runtime dependency · weakening any security default · license uncertainty · a test you cannot make deterministic · anything that makes you want to add `TODO`.

## Progress ledger

Maintain `docs/PROGRESS.md` (one line per completed task: ID, date, commit, evidence link) and `docs/progress/<task-id>.md` (commands run + trimmed real output).
