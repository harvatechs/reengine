# Precise Scale Index & Recovery Protocol — ReEngine CLI

## Error-Balancing & Drift-Recovery Protocol (`balancing-if-error[if-work-goes-wrong]`)

This protocol governs how the engineering agent (during build) and ReEngine CLI itself (during runtime) measure health, detect drift, and execute deterministic recovery without spiraling into hacks or broken loops.

## 1. Quantitative Precision Scale Index (PSI: 0–100)

Evaluate the project health score at the end of every phase (and automatically in CI):

| Dimension | Weight | Metric & 100% Target | Degraded Threshold (Action Required) |
| --- | --- | --- | --- |
| **Type & Contract Integrity** | 25 | 0 TypeScript errors, 0 `any` casts, 100% Zod validation at boundaries | Any type error or unchecked boundary parse |
| **Process & MCP Reliability** | 25 | 0 orphan child processes after exit, MCP handshake under 3s, crash recovery passes | Any zombie process or unhandled stdio broken pipe |
| **Provider Interoperability** | 20 | All target adapters pass streaming + tool-call + error-recovery contract tests | Tool-schema rejection on Gemini/OpenAI/Anthropic or broken local Ollama stream |
| **TUI Render Stability** | 20 | 0 flicker frames, 0 `useInput` collisions, passes 80x24 & 160x48 layout tests | Visual overflow, broken box borders, or frozen Ctrl+C |
| **Bundle & Startup Hygiene** | 10 | Cold start under 350 ms, 0 `console.log` calls in core/ui, clean `npm pack` | Cold start over 700 ms or stdout corruption |

* **PSI 90–100 (Green — Proceed):** Advance to next workstream.
* **PSI 75–89 (Amber — Stabilize):** Halt new feature work; fix failing dimension before continuing.
* **PSI under 75 (Red — Circuit Breaker & Rollback):** Stop immediately, `git diff` audit the last atomic commit, isolate the root cause with a minimal failing reproduction test, and repair cleanly rather than patching symptoms.

## 2. Runtime & Build Failure Balancing Matrix (Exact Signatures & Recovery)

| Severity | Failure Signature | Root Cause | Mandatory Balancing Action (If Work Goes Wrong) |
| --- | --- | --- | --- |
| **S0 (Critical)** | MCP `stdio` JSON-RPC parse crash (`Unexpected token` on stdout) | Child process (or sub-tool like Ghidra/npm) printed logs to `stdout` instead of `stderr`. | 1. Wrap REA launch with `--silent` / quiet env flags. 2. Implement line-buffered JSON-RPC framing filter in `McpSupervisor` that quarantines non-JSON stray lines to `mcp-rea.log` with a `WARN` event instead of killing the session. |
| **S0 (Critical)** | Orphaned `rea-agents` / Ghidra / Frida processes left alive after crash or `Ctrl+C` | Missing signal handlers or Windows process-tree detachment. | 1. Register `ProcessRegistry` hooks on `SIGINT`, `SIGTERM`, `beforeExit`, `uncaughtException`. 2. Use process groups (`detached: false` on POSIX with group kill; `taskkill /pid <pid> /T /F` on Windows). Verify with integration test asserting PID dead within 3s. |
| **S1 (High)** | LLM context window overflow (`400 context_length_exceeded`) mid-investigation | Large disassembly/decompilation or AST output injected raw into chat history. | 1. Enforce `ArtifactSpillover` hard cap (`maxInlineChars`) before appending any tool result. 2. Trigger emergency `ContextCompactor` pass (shrink oldest tool messages to 1-line artifact pointers) and retry turn automatically once. |
| **S1 (High)** | Provider rejects MCP tool schema (`Invalid schema for function...`) | Strict schema dialect differences between Gemini, OpenAI, and Anthropic. | 1. Run `SchemaNormalizer` unit tests against every actual tool returned by `rea-agents`. 2. If a single tool schema fails validation on a specific provider, quarantine only that tool with a clear `/mcp` warning rather than failing the entire agent turn. |
| **S1 (High)** | TUI freezes, flickers violently, or eats `Ctrl+C` during high-speed streaming | Unthrottled React re-renders per token, missing `<Static>`, or conflicting `useInput` hooks. | 1. Enforce 33 ms stream batching buffer. 2. Move committed history to `<Static>`. 3. Route all keyboard input through central `FocusManager`. 4. Disable Ink's `exitOnCtrlC` and bind unified interrupt handler. |
| **S2 (Medium)** | Local engine (Ghidra/IDA/Frida) not found on user machine | Engine not installed or missing from `PATH`. | **Graceful Degradation:** Never block startup! Mark missing native engines as `unavailable` in `/engines`, keep zero-dependency `JS/Electron/ASAR` and file inspection active, and show exact OS-specific install/path hint in `reengine doctor`. |
| **S2 (Medium)** | Emoji / Nerd Font glyphs misalign table borders on Windows/macOS | Terminal `string-width` mismatch or missing Nerd Font installed. | Default `iconPack` to safe `unicode` (single-width geometric symbols `●`, `▸`, `✓`, `✕`), auto-fallback to `ascii` when `TERM=dumb` or `NO_COLOR=1`, and expose instant `/ui icons ascii` toggle. |
| **S3 (Low)** | Builder Agent loops greater than 3 failed attempts fixing the same test/bug | Architectural mismatch or wrong assumption about an upstream API. | **Agent Stop-Loss Rule:** After 3 failed attempts on the same error: (1) stop editing, (2) read the upstream package's actual `node_modules/.../*.d.ts` type definitions, (3) write a 15-line isolated repro script, (4) fix the root contract cleanly. |
