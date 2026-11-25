# Skills & Operational Playbooks — ReEngine CLI

Operational playbooks for both the **Builder Agent** (creating ReEngine CLI) and the **Built-in System Prompt** (inside ReEngine CLI when driving REA).

## Skill 1: `rea-mcp-orchestration`

* **Purpose:** Spawn, verify, and operate `morluto/rea` reliably across Linux/macOS/Windows.
* **Procedure:**
  1. Launch via `StdioClientTransport` with explicit `env` inheritance (preserving `PATH`, `GHIDRA_INSTALL_DIR`, `JAVA_HOME`, `IDA_PATH`, `FRIDA_HOST`) and `stderr: 'pipe'`.
  2. Call `client.listTools()` on startup; cache tool schemas and tag each tool with its REA domain (`native`, `javascript`, `android`, `firmware`, `runtime`, `evidence`, `general`) based on tool name/contract prefixes.
  3. On tool call execution, apply per-domain timeouts: `30s` for quick queries/JS route scans, `180s` for Ghidra/JADX initial imports, `60s` for runtime captures (configurable in `config.json`).
  4. Parse returned structured content for REA `evidence` arrays and `coverage` payloads, indexing them immediately into `EvidenceStore` so the user can query `/evidence` at any time.

## Skill 2: `ink-tui-craftsmanship`

* **Purpose:** Build responsive, flicker-free Claude-Code-style terminal interfaces.
* **Procedure:**
  1. Separate layout primitives (`Box`, `Text`) from domain state; inject theme tokens exclusively via `useTheme()`.
  2. Compute viewport dimensions dynamically from `useTerminalSize()` (`rows`, `columns`); gracefully adapt down to `80x24` terminals by collapsing secondary status segments and shortening badges.
  3. Wrap heavy leaf components (`MarkdownView`, `ToolCallCard`, `CodeBlock`) in `React.memo` with shallow primitive props.
  4. Test every interactive component with `ink-testing-library` simulating real stdin keystrokes (`\r`, `\x1b`, `\x03`, arrow keys).

## Skill 3: `universal-llm-adapter-engineering`

* **Purpose:** Guarantee identical tool-calling and streaming reliability across 10+ LLM backends.
* **Procedure:**
  1. Normalize all provider SSE streams into one internal `AsyncIterable<ProviderStreamChunk>` (`text`, `reasoning`, `tool_call_delta`, `usage`, `finish`).
  2. Buffer partial JSON tool arguments until `finish` or tool-call boundary, then validate with `JSON.parse` + recovery repair for trailing commas/whitespace; if malformed, send a structured tool-validation error back to the model for self-correction instead of crashing.
  3. Implement exponential backoff with jitter (`1s`, `2s`, `4s`, `8s`, respecting `Retry-After` headers) for HTTP `429`, `502`, `503`, `529`, plus automatic fallback to `config.router.fallbackProfile` if configured.

## Skill 4: `reengine-runtime-investigation-prompt` (Embedded Default System Prompt)

When ReEngine CLI runs an investigation for a user, its default system prompt instructs the connected LLM to follow an **Evidence-First Reverse Engineering Methodology**:

1. **Survey First:** Identify target format (ELF/PE/Mach-O/ASAR/APK/Firmware) and confirm available REA engines before running heavy analysis.
2. **Cite Evidence:** Every technical claim about target behavior MUST reference a concrete REA evidence item (file path, line number, virtual address, symbol name, or artifact ID).
3. **Never Hallucinate Addresses or Symbols:** If a binary is stripped or a bridge is unavailable, state the gap explicitly and propose the next concrete REA inspection step.
4. **Respect Scope & Permissions:** Prefer non-invasive static analysis before proposing dynamic instrumentation (Frida/GDB/Playwright).
