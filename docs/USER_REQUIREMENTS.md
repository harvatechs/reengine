# User Requirements — ReEngine CLI

## 1. Target Personas

* **Security & Binary Analysts:** Need fast triage of ELF/PE/Mach-O binaries, firmware, Android APKs, and Electron/ASAR apps with verifiable evidence trails.
* **Systems & Interoperability Engineers:** Need to understand legacy protocols, closed-source desktop apps, or undocumented file formats and reconstruct clean-room specifications.
* **AI Power Users & Researchers:** Want to run local quantized models (`llama-server`, Ollama) or multi-provider routers (OpenRouter) directly against REA's MCP toolset with minimal terminal friction.

## 2. Functional Requirements (FR)

### FR-1: First-Run Onboarding & Zero-Click REA Setup

* **FR-1.1:** Running `reengine` with no existing config launches a 3-step keyboard-navigable Setup Wizard: (1) Select/configure LLM Provider & API Key (or local endpoint), (2) Auto-scan & register built-in REA MCP + local analysis engines, (3) Select Theme & Density preset.
* **FR-1.2:** `reengine doctor` executes a deterministic diagnostic check reporting: Node.js version, REA MCP reachability (`rea-agents`), detected native engines (Ghidra, Hopper, IDA, Kuna, Cutter, GDB, Frida, JADX, Playwright), LLM endpoint connectivity + tool-calling capability check, and terminal capabilities (TrueColor, Unicode width, Kitty/WezTerm/iTerm2/Windows Terminal detection).
* **FR-1.3:** Users can attach a target directory, binary, APK, or ASAR immediately on launch: `reengine ./target.exe` or `reengine --target /path/to/app.asar`.

### FR-2: Universal LLM & Router Connectivity

* **FR-2.1:** Native first-class adapters for: `anthropic`, `openai`, `google`, `openrouter`, `ollama`, `lmstudio`, `llamacpp`, `litellm`, `deepseek`, `groq`, and `openai-compatible` (arbitrary base URL + custom headers + custom model ID).
* **FR-2.2:** Support per-session and mid-conversation model switching (`/model`), plus **Dual-Role Routing**: optional `primaryModel` (deep reasoning/reconstruction) and `fastModel` (context summarization, commit/report formatting, large-output triage).
* **FR-2.3:** Automatic capability negotiation: detects streaming, native tool-calling, parallel tool calls, reasoning/thinking blocks, and context window size; gracefully degrades to structured JSON tool-calling fallback only if explicitly enabled for legacy local models.
* **FR-2.4:** Live token telemetry & cost ledger in the status bar (input tokens, cached tokens, output tokens, context window fill %, estimated USD cost for paid APIs or tokens/sec for local models).

### FR-3: Built-in REA MCP & Multi-MCP Orchestration

* **FR-3.1:** ReEngine embeds and supervises the REA MCP server over `stdio` by default (`@modelcontextprotocol/sdk` `StdioClientTransport`), with clean lifecycle handling (start, restart, graceful SIGTERM → SIGKILL escalation).
* **FR-3.2:** Users can also connect **additional external MCP servers** (via `stdio` or `Streamable HTTP`, e.g., Fiddler Everywhere MCP for HTTP debugging or custom binary-diff MCPs) through `~/.reengine/mcp.json` or `/mcp add`.
* **FR-3.3:** **Clean Backend Processing Showcase:** While REA runs long-running operations (e.g., Ghidra headless import, JADX decompilation, Frida attach, Playwright trace), the UI renders a non-blocking live progress card displaying tool name, engine badge (e.g., `[GHIDRA]`, `[JS/ASAR]`, `[FRIDA]`), elapsed time, spinner/progress, and streaming log tail—never freezing user input or corrupting screen layout.
* **FR-3.4:** **Artifact Spillover & Evidence Linking:** Any MCP tool output exceeding `config.mcp.maxInlineChars` (default: 12,000 chars) is persisted to `.reengine/artifacts/<session-id>/<call-id>.json`, summarized structurally for the LLM context window with exact byte/line handles, and inspectable in full inside the TUI via the `/inspect <id>` drawer.
* **FR-3.5:** **Reconstruction Coverage Display:** Parses REA evidence/coverage metadata when returned by REA tools and renders a compact coverage indicator in the workspace header/inspector.

### FR-4: Claude-Code-Inspired TUI & Interaction Grammar

* **FR-4.1:** Minimal, high-signal layout: Top thin context bar (Target, Active Engine badges, Model, Context %), Main scrollable conversation & tool-card stream, Pinned multi-line composer with `@` file/symbol/artifact autocomplete and `/` slash-command palette, Bottom status/keybinding hint rail.
* **FR-4.2:** Core Slash Commands: `/help`, `/model`, `/provider`, `/mcp`, `/engines`, `/target`, `/evidence`, `/inspect`, `/theme`, `/ui`, `/permissions`, `/compact`, `/clear`, `/export`, `/session`, `/doctor`, `/exit`.
* **FR-4.3:** Core Keyboard Shortcuts (all user-remappable): `Ctrl+C` (cancel active generation/tool on 1st press; double-press to exit cleanly), `Ctrl+O` (toggle expand/collapse latest tool/evidence card), `Ctrl+K` (command palette), `Ctrl+T` (cycle theme/inspect reasoning), `Ctrl+E` (open Evidence Drawer), `Tab` (autocomplete), `Shift+Enter` or `\ + Enter` (newline in composer).
* **FR-4.4:** **Headless / Scriptable Mode:** `reengine run "<prompt>" --target <path> --format json|markdown --auto-approve-read` enables CI pipelines, batch binary analysis, and piping without launching the interactive Ink TUI.

### FR-5: Complete UI & Visual Customization System

* **FR-5.1:** **Color & Theme Engine:** Built-in curated presets (`obsidian-minimal`, `alabaster-zen`, `nord-slate`, `solar-carbon`, `high-contrast`, `monochrome-ansi`), plus full user-editable JSON theme files supporting 24-bit HEX colors for every semantic token (`bg`, `surface`, `textPrimary`, `textMuted`, `accent`, `border`, `toolRunning`, `toolSuccess`, `toolError`, `codeKeyword`, `codeAddr`, `diffAdd`, `diffRemove`).
* **FR-5.2:** **Layout & Typography Scale:** User-configurable `density` (`compact` | `balanced` | `spacious`), `maxContentWidth` (`80`–`160` cols or `full`), `borderStyle` (`none` | `hairline` | `rounded` | `heavy` | `double`), `iconPack` (`nerd` | `unicode` | `ascii`), `showTimestamps`, `showTokenCost`, `collapseToolsByDefault`, and `codeLineNumbers`.
* **FR-5.3:** **Font Family & Font Size Control (Terminal-Honest Architecture):**
  * Terminal applications run inside a host terminal emulator and cannot directly rasterize arbitrary TrueType fonts inside a standard PTY grid.
  * ReEngine implements **three genuine mechanisms** so users truly control font family and size cleanly:
    1. **Live Terminal Escape Bridges (where supported):** Safe, opt-in OSC/IPC hooks for **Kitty** (`kitty @ set-font-size`), **WezTerm** (user var / config snippet), and **iTerm2** (profile switch escape sequence) triggered from `/ui font-size <pt>`.
    2. **Terminal Profile Generator (`reengine ui apply-terminal`):** Generates and optionally installs a dedicated `"ReEngine"` profile (setting exact `fontFamily`, `fontSize`, `lineHeight`, and palette) for **Windows Terminal**, **Ghostty**, **Alacritty**, **WezTerm**, **Kitty**, and **iTerm2**.
    3. **Visual Text Scale & Hierarchy inside TUI:** Configurable `textScale` (`compact` single-line headers, `standard`, `prominent` padded typographic section headers and wide spacing) that dynamically adapts component density to terminal columns/rows.
* **FR-5.4:** Live Hot-Reload: Editing `~/.reengine/theme.json` or running `/theme` / `/ui` updates the live TUI instantaneously without restarting the session or dropping MCP connections.

### FR-6: Security, Approvals & Session Persistence

* **FR-6.1:** Tiered Permission Modes:
  * `readonly-auto` (default): Static REA analysis tools (inspect JS/ASAR, read strings/symbols, list functions, read artifacts) execute automatically; dynamic/mutating tools (Frida attach, GDB write, Playwright execution, shell commands, file writes) require explicit interactive approval (`[y] Allow once`, `[a] Allow tool for session`, `[n] Deny`).
  * `strict`: Every tool call requires approval.
  * `trusted-yolo`: Auto-approves all non-destructive tools (explicitly flagged in red badge in header).
* **FR-6.2:** Every session persists locally in `~/.reengine/sessions/<id>.jsonl` with full tool calls, evidence references, and cost summary; resumable via `reengine --resume` and exportable to clean Markdown or JSON reports (`/export report.md`).

## 3. Non-Functional Requirements (NFR)

* **Cold Start Latency:** Less than 350 ms to first rendered TUI frame (REA MCP initializes asynchronously in background with live status indicator so the user can start typing immediately).
* **TUI Frame Stability:** Zero flicker at 60+ tokens/sec streaming; render loop throttled to 30–60 FPS via batched state updates; strict memoization of completed message blocks.
* **Cross-Platform Parity:** Full support on Linux (x64/arm64), macOS (Apple Silicon/Intel), and Windows 11 (Windows Terminal / PowerShell 7 / Git Bash).
* **Memory Ceiling:** Under 250 MB resident memory for the ReEngine Node process during normal sessions (achieved via disk-backed artifact spillover and bounded in-memory ring buffers).
* **Clean Exit Guarantee:** 100% deterministic cleanup of all child MCP processes and temporary IPC sockets on `SIGINT`, `SIGTERM`, `SIGHUP`, and uncaught exceptions.
