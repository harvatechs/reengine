# What Not to Do — ReEngine CLI Anti-Patterns & Hard Guardrails

Strict anti-slop enforcement checklist. If the coding agent catches itself doing **any** of the following, delete the offending code immediately and rewrite properly.

## 1. Architectural & Engineering Sins

* **DO NOT hardcode a single LLM SDK or vendor.** Never couple the agent loop directly to `@anthropic-ai/sdk` or `openai` types; all orchestration speaks only to `@reengine/providers` normalized interfaces.
* **DO NOT shell out to `npx rea-agents` on every single tool call.** Spawn a persistent, supervised MCP server session over `stdio` once per workspace and reuse it across turns; spawning `npx` per tool call ruins latency and breaks stateful sessions (Ghidra/Frida/GDB).
* **DO NOT dump raw multi-megabyte JSON tool outputs into the LLM context or terminal screen.** Always spill large payloads to `.reengine/artifacts/` and render a concise summary + interactive drawer handle.
* **DO NOT build a fake/simulated REA backend as your "MVP."** Mock servers belong strictly in `tests/`. Production `@reengine/mcp-rea` MUST speak real MCP JSON-RPC 2.0 via `@modelcontextprotocol/sdk` to real `morluto/rea` (`rea-agents`).
* **DO NOT silently swallow errors** with `catch (e) {}` or `catch { return null; }`. Every caught error must either recover with an explicit logged fallback or surface a structured `ReEngineError`.
* **DO NOT mix UI code with business logic.** Zero `fetch()`, zero `child_process.spawn()`, and zero `fs.writeFile()` inside `.tsx` components.

## 2. TUI & Design Sins (Anti-Slop Aesthetic Rules)

* **DO NOT create cluttered "hacker-movie" rainbow dashboards.** Follow Claude Code's restraint: generous breathing room, crisp semantic color hierarchy, maximum 1–2 accent colors per screen, muted metadata, high-contrast primary text.
* **DO NOT claim to change system terminal fonts with broken ANSI hacks.** Never emit unguarded proprietary escape codes that print garbage characters on Windows Terminal or standard xterm. Gate OSC font hooks strictly behind detected terminal support and provide the clean `reengine ui apply-terminal` profile writer.
* **DO NOT draw ASCII banners bigger than 3 lines on startup.** A pro CLI opens instantaneously ready for input—not with a 25-line ASCII dragon pushing the workspace off-screen.
* **DO NOT print debug logs to `stdout` or `stderr` while Ink owns the TTY.** It will corrupt cursor positioning and shatter the layout.

## 3. Security & Delivery Sins

* **DO NOT write API keys in plaintext into project-local `.reengine/config.json`** (users commit project directories to git!). Project config stores only provider names, model IDs, and theme overrides; secrets live exclusively in environment variables or OS-restricted `~/.reengine/credentials.json` (`chmod 0600`).
* **DO NOT auto-approve dynamic execution tools (`frida`, `gdb`, shell, filesystem writes) by default.** Safe `readonly-auto` must be the out-of-the-box default.
* **DO NOT declare "MVP Complete" based solely on `tsc` compiling.** MVP is complete ONLY when `reengine doctor`, interactive TUI tests, provider contract tests, and a real end-to-end REA analysis run pass cleanly on a fresh install.
