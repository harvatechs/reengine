# Rules — ReEngine CLI

These rules are **inviolable**. An AI coding agent violating any rule MUST halt and remediate before advancing to the next task.

1. **Zero Pseudocode, Zero Stubs, Zero `TODO` Placeholders:** Every merged file MUST compile cleanly and execute real logic. Placeholder functions returning hardcoded fake tool outputs or `throw new Error('Not implemented')` are strictly forbidden outside dedicated test mocks in `tests/`.
2. **Strict TypeScript Hygiene:** `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`, `noImplicitOverride: true`. Zero `any` casts (use `unknown` + Zod validation). Zero `@ts-ignore` or `@ts-expect-error` without an inline ticket-grade justification comment.
3. **Strict Layer Isolation:**
   * `@reengine/core` MUST NEVER import `ink`, `react`, or terminal ANSI libraries.
   * `@reengine/providers` MUST NEVER import `@reengine/ui` or `@reengine/mcp-rea`.
   * `@reengine/ui` MUST NEVER spawn child processes, read API keys directly, or invoke LLM HTTP endpoints directly.
4. **Zero Stdout Pollution:** `console.log` is BANNED everywhere in `packages/core`, `packages/providers`, `packages/mcp-rea`, and `packages/ui`. All diagnostics go exclusively through the injected `Logger` writing to `~/.reengine/logs/reengine.log` (structured NDJSON).
5. **Deterministic Process Cleanup:** Every spawned MCP child process MUST be registered in `ProcessRegistry` and terminated cleanly on exit (`SIGTERM`, 2,000 ms grace window, then `SIGKILL` / `taskkill /T /F` on Windows).
6. **Runtime Boundary Validation:** Every external input—config files, theme JSON, CLI arguments, MCP tool results, LLM SSE chunks—MUST be validated with Zod or a dedicated type guard before entering domain logic.
7. **Secret Safety:** API keys and auth tokens MUST NEVER appear in logs, session JSONL files, crash dumps, exported reports, or TUI render trees. Implement a mandatory `SecretRedactor` pass on all loggers and exporters.
8. **Small, Atomic Verification:** After every module is created or modified, the agent MUST run:
   ```bash
   pnpm typecheck && pnpm lint && pnpm test
   ```
   Never stack 10 untested files before running verification.
