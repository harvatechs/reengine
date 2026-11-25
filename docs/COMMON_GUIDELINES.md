# Common Guidelines — ReEngine CLI

## 1. Code Style & Tooling

* **Formatter & Linter:** Biome (`biome.json`) — single quotes, 2-space indent, trailing commas, 100-char line width, organized imports.
* **Test Runner:** Vitest (`vitest.config.ts`) + `ink-testing-library` for TUI components.
* **File Naming:** `kebab-case.ts` for logic modules, `PascalCase.tsx` for React/Ink components, `*.test.ts` colocated or mirrored under `tests/`.
* **Function Size:** Target under 60 lines per function; decompose complex orchestrators into pure helper functions so every branch is unit-testable.

## 2. Error Handling Taxonomy

Every thrown or returned error across the codebase MUST use `ReEngineError` with a stable machine-readable code:

```typescript
export type ErrorCode =
  | 'CONFIG_INVALID'
  | 'PROVIDER_AUTH_FAILED'
  | 'PROVIDER_RATE_LIMITED'
  | 'PROVIDER_CONTEXT_OVERFLOW'
  | 'PROVIDER_SCHEMA_REJECTED'
  | 'PROVIDER_STREAM_ABORTED'
  | 'MCP_SPAWN_FAILED'
  | 'MCP_HANDSHAKE_TIMEOUT'
  | 'MCP_TOOL_TIMEOUT'
  | 'MCP_TOOL_EXECUTION_FAILED'
  | 'MCP_CRASHED_RESTARTING'
  | 'PERMISSION_DENIED'
  | 'TARGET_NOT_FOUND'
  | 'ARTIFACT_WRITE_FAILED'
  | 'TERMINAL_UNSUPPORTED';

export class ReEngineError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly recoverable: boolean,
    public readonly userHint: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ReEngineError';
  }
}
```

* **UI Rendering Rule:** Never dump raw stack traces into the chat stream. Display `code` + concise `message` + actionable `userHint`, while logging the full stack trace to `~/.reengine/logs/reengine.log`.

## 3. Ink Terminal Rendering Guidelines

* **Use `<Static>` for Committed History:** Completed turns and immutable tool cards MUST be rendered inside Ink's `<Static>` container (or memoized immutable rows) so live streaming tokens only re-render the active turn box—preventing terminal flicker and scrollback corruption.
* **Throttle Streaming Renders:** Buffer incoming `text:delta` and `reasoning:delta` chunks and flush to React state at max 30 Hz (every 33 ms).
* **Input Focus Safety:** Every `useInput` hook MUST accept `{ isActive }` wired to a single `FocusManager` (`composer` | `modal` | `drawer` | `palette`) so keystrokes never fire across two screens simultaneously.
* **Ctrl+C Override:** Always call Ink `render(<App/>, { exitOnCtrlC: false })` and manage `Ctrl+C` centrally: abort active stream/tool if busy, show `"Press Ctrl+C again to exit"` toast if idle, tear down `ProcessRegistry` before `exit()`.
* **Width & Unicode Hygiene:** Normalize all column calculations via `string-width` and avoid ambiguous double-width emoji in borders/status bars; prefer deterministic Nerd Font / Unicode / ASCII glyph tables.

## 4. Commit & PR Discipline

Use Conventional Commits: `feat(mcp-rea): add StreamableHTTPClientTransport support`, `fix(ui): prevent double useInput trigger in theme modal`, `test(providers): add Gemini tool schema sanitizer fixtures`.
