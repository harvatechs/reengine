# user-requirements.md

Priorities: **M** = Must (blocks 1.0.0) · **S** = Should (ship in 1.0.0 unless a gate-approved descope) · **C** = Could (post-1.0, designed-for only).
Every requirement has an ID; every task in `division-of-work.md` and every test must reference one.

## 1. Primary user journeys

**J1 — First run (target ≤ 5 min).**
`npm i -g reengine-cli` → `reengine` → first-run screen: responsible-use notice (acknowledge) → provider wizard (pick preset, paste key *or* choose env var, test connection, pick model) → engine check (REA found, version, which analysis providers detected, what works without any) → empty prompt with example: *"Analyze ./app and explain how its IPC works."*

**J2 — Investigate a JavaScript/Electron app.**
User adds a target (`/targets add ./app` or via prompt path) → asks a question → sees live tool cards (REA running, progress) → receives an answer whose claims link to evidence entries marked observed/inferred/unknown → `/report` exports a Markdown report.

**J3 — Native binary.**
Same as J2, but engine panel shows Ghidra/Hopper/IDA availability; if none is installed the UI explains exactly what is missing and links REA's setup guide rather than failing opaquely.

**J4 — Swap model mid-investigation.**
`/model` → pick OpenRouter model → history preserved → continues.

**J5 — CI.**
`reengine run --output stream-json --permission-mode plan "…" < context.md` → NDJSON events → exit code 0/…/6 as defined.

**J6 — Restyle.**
`/theme` live preview → pick → `reengine theme export --terminal wezterm` → paste font/colors into terminal config.

## 2. Functional requirements

### 2.1 CLI & modes
| ID | Requirement | Pri | Acceptance |
|---|---|---|---|
| FR-CLI-01 | `reengine` starts the interactive TUI in the current directory | M | First paint ≤ 800 ms cold on reference HW, REA starts lazily in background |
| FR-CLI-02 | `reengine run "<prompt>"` headless; `--output text\|json\|stream-json` | M | Golden-file tests for all three formats |
| FR-CLI-03 | Piped stdin is prepended as context in `run` mode | M | Integration test |
| FR-CLI-04 | `--continue` (latest session in cwd) and `--resume <id>` | M | Session restored incl. todo + targets |
| FR-CLI-05 | Subcommands: `setup doctor config providers models mcp engine theme sessions report completion version` | M | `--help` exists with examples for each |
| FR-CLI-06 | Shell completion for bash/zsh/fish/pwsh | S | `completion <shell>` emits tested scripts |
| FR-CLI-07 | Non-TTY without `run` → clear error, exit 2; never starts Ink | M | Test with piped stdout |
| FR-CLI-08 | Deterministic exit codes (specs §9.2) | M | Table-driven test |

### 2.2 Model providers
| ID | Requirement | Pri | Acceptance |
|---|---|---|---|
| FR-PRV-01 | `openai-compatible` adapter for any `baseUrl` (custom headers, query params, auth styles) | M | Shared contract suite passes |
| FR-PRV-02 | `anthropic` adapter | M | Contract suite passes |
| FR-PRV-03 | `gemini` adapter | M | Contract suite passes |
| FR-PRV-04 | ≥ 10 presets: openai, anthropic, gemini, openrouter, ollama, lm-studio, litellm, groq, together, deepseek, mistral, azure-openai (custom-url template) | M | `providers presets` lists them; each preset validated against schema |
| FR-PRV-05 | Add any provider via config or wizard with zero code changes | M | Test adds a never-seen provider against mock server |
| FR-PRV-06 | Model discovery (`/models`) + manual model entries + capability overrides | M | Unit + integration |
| FR-PRV-07 | Switch provider/model mid-session preserving history | M | Cross-provider replay test (reasoning blocks of other providers dropped) |
| FR-PRV-08 | Streaming, cancel ≤ 500 ms, retry with backoff, connect/idle timeouts | M | Fault-injection tests |
| FR-PRV-09 | Role models: `main`, `compaction`, `title` | S | Config + test |
| FR-PRV-10 | Normalized reasoning effort (`off\|low\|medium\|high`) mapped per adapter | S | Adapter tests |
| FR-PRV-11 | Anthropic prompt caching on system+tools+rolling prefix | S | Fixture asserts cache markers |
| FR-PRV-12 | Token/cost display from user-configured pricing | S | Unit |
| FR-PRV-13 | HTTP(S) proxy env vars and `NODE_EXTRA_CA_CERTS` honored | M | Integration with local proxy |
| FR-PRV-14 | OpenAI Responses API adapter; OAuth device-login | C | — |

### 2.3 Agent core
| ID | Requirement | Pri | Acceptance |
|---|---|---|---|
| FR-AGT-01 | Tool-calling loop per specs §5 with max-step guard (default 60) | M | Loop tests |
| FR-AGT-02 | Cancel at any moment (Esc / Ctrl+C) leaves a consistent, resumable session | M | Abort-at-each-state tests |
| FR-AGT-03 | Context budgeting + auto-compaction at 80% (configurable) | M | Compaction tests incl. evidence preservation |
| FR-AGT-04 | Repeated-failure loop detection | M | Test |
| FR-AGT-05 | Plan mode (read-only tools, ends with user-approved plan) | M | Permission truth-table |
| FR-AGT-06 | Project memory `REENGINE.md` (+ `AGENTS.md` fallback) hierarchical load | M | Prompt-builder tests |
| FR-AGT-07 | Todo tool + UI panel | S | UI test |
| FR-AGT-08 | Subagents | C | — |

### 2.4 Built-in tools
| ID | Requirement | Pri |
|---|---|---|
| FR-TOOL-01 | `read_file`, `list_dir`, `glob`, `grep` (pure JS, `.gitignore`-aware, size/line caps) | M |
| FR-TOOL-02 | `write_file`, `edit_file` (exact-match replace, uniqueness enforced, diff preview) | M |
| FR-TOOL-03 | `shell` (timeout, process-tree kill, output cap, scrubbed env) | M |
| FR-TOOL-04 | `todo_write` | S |
| FR-TOOL-05 | `artifact_read`, `artifact_search` for spilled large outputs | M |
| FR-TOOL-06 | Large-output spill: results > `tools.spillThresholdTokens` stored as artifacts, model sees head/tail + id | M |
| FR-TOOL-07 | `web_fetch` | C |

### 2.5 MCP
| ID | Requirement | Pri |
|---|---|---|
| FR-MCP-01 | stdio client | M |
| FR-MCP-02 | Streamable HTTP client | M |
| FR-MCP-03 | Legacy SSE client | S |
| FR-MCP-04 | Discovery, namespacing `mcp__<server>__<tool>` (≤ 64 chars, collision-safe), JSON-Schema validation of arguments | M |
| FR-MCP-05 | Progress notifications shown live; cancellation propagated; timeouts reset on progress | M |
| FR-MCP-06 | `tools/list_changed` handled; new tools default to *ask* | M |
| FR-MCP-07 | MCP prompts exposed as slash commands (`/mcp__<server>__<prompt>`) | M |
| FR-MCP-08 | MCP resources via `@server:resource` mention | S |
| FR-MCP-09 | `mcp add\|list\|remove\|enable\|disable\|doctor` | M |
| FR-MCP-10 | Per-server env, cwd, timeouts, trust level | M |
| FR-MCP-11 | OAuth for remote MCP | C |

### 2.6 REA engine
| ID | Requirement | Pri | Acceptance |
|---|---|---|---|
| FR-REA-01 | Built-in REA server auto-resolved, launched, supervised; no user MCP JSON | M | Integration with real pinned REA |
| FR-REA-02 | Live engine status chip + Inspector panel (state, version, provider, pid, uptime, last stderr lines) | M | UI test |
| FR-REA-03 | `engine doctor` consolidating `rea mcp doctor --json`, `rea providers --json`, `rea capabilities --json` | M | Fixture-driven tests |
| FR-REA-04 | Analysis-provider selection via config → `REA_ANALYSIS_PROVIDER` | M | Env-propagation test |
| FR-REA-05 | Targets registry (declare/list/remove; path-arg guard) | M | Guard tests |
| FR-REA-06 | Evidence rendering with observed/inferred/unknown, limitations, source refs; generic fallback for unknown shapes | M | Fixture tests |
| FR-REA-07 | Tool policy table classifying every REA tool (risk, long-running, path args); unknown tools → ask | M | Contract test fails if catalog has unclassified tool |
| FR-REA-08 | Graceful degradation when no native analysis engine exists | M | Test with no providers |
| FR-REA-09 | Version pin + contract test gating any REA bump | M | CI job |
| FR-REA-10 | Auto-snapshot injection for `open_binary` (`snapshot_path`) when schema supports it | S | Test |
| FR-REA-11 | `/report` Markdown export from session evidence (deterministic, no LLM) | S | Golden test |
| FR-REA-12 | Alternate HTTP transport (`rea mcp --http`) | C | — |

### 2.7 UI & customization
| ID | Requirement | Pri |
|---|---|---|
| FR-UI-01 | Semantic theme tokens, 5 built-in themes (dark, light, high-contrast, mono, solarized), user themes in `themes/*.json` | M |
| FR-UI-02 | Color depth auto-downsample (truecolor/256/16/none); `NO_COLOR`, `--no-color` | M |
| FR-UI-03 | Density, border style, glyph set (unicode/ascii/nerd), spinner, wrap width, reasoning visibility, tool-output mode — all configurable | M |
| FR-UI-04 | Fully remappable keybindings (`keybindings.json`) | M |
| FR-UI-05 | Live theme preview picker; `/config` interactive editor | M |
| FR-UI-06 | Terminal-profile exporter (font family/size/line-height/colors) for kitty, wezterm, alacritty, ghostty, iTerm2, Windows Terminal, VS Code | M |
| FR-UI-07 | Markdown rendering, syntax highlighting, **assembly/pseudocode highlighting with RE tokens** | M |
| FR-UI-08 | Permission prompt with diff/command preview and 5 answer choices | M |
| FR-UI-09 | Status bar (mode, model, context %, cost, engine, cwd) | M |
| FR-UI-10 | Detail viewer (alt-screen) for full tool output | M |
| FR-UI-11 | Resize-safe; ≥ 60 columns usable; < 60 degrades to single column | M |
| FR-UI-12 | Plain/accessibility mode (no spinners, linear output) | M |
| FR-UI-13 | Vim keybinding mode in composer | C |

### 2.8 Config, sessions, security
| ID | Requirement | Pri |
|---|---|---|
| FR-CFG-01 | Layered config: defaults < user < project < env < flags; JSONC; Zod-validated with path-precise errors | M |
| FR-CFG-02 | `config get\|set\|list\|path\|edit\|schema\|validate` | M |
| FR-CFG-03 | Project trust gate for project-supplied MCP servers/commands | M |
| FR-CFG-04 | Config versioning + migrations | M |
| FR-SES-01 | JSONL sessions, content-addressed artifacts, crash-safe appends | M |
| FR-SES-02 | `sessions list\|show\|export(md,json)\|delete\|prune` | M |
| FR-SES-03 | Retention policy (default 90 days) | S |
| FR-SEC-01 | Secrets by reference (`env:`, `file:`, `keychain:`) | M |
| FR-SEC-02 | Permission engine, modes, rules, taint guard | M |
| FR-SEC-03 | Terminal-escape sanitization of all model/tool text | M |
| FR-SEC-04 | Log redaction | M |

## 3. Non-functional requirements

| ID | Requirement | Target |
|---|---|---|
| NFR-PERF-01 | Cold start to interactive prompt | ≤ 800 ms (M-series/modern x64, no REA wait) |
| NFR-PERF-02 | Streaming render | ≤ 30 fps cap; ≤ 50 ms input latency while streaming |
| NFR-PERF-03 | Idle memory (TUI, no REA) | ≤ 200 MB RSS |
| NFR-PERF-04 | 10 000-message session resume | ≤ 3 s |
| NFR-REL-01 | Provider/MCP/REA failure never crashes the UI | Chaos tests |
| NFR-REL-02 | Session log survives kill -9 | Last complete record intact |
| NFR-PORT-01 | macOS (arm64/x64), Linux (x64/arm64), Windows 10+ (x64) | CI matrix; REA capabilities per REA's own support |
| NFR-SEC-01 | No plaintext secrets at rest by default | Audit test |
| NFR-PRIV-01 | Zero telemetry | Network-egress test asserts only configured hosts |
| NFR-A11Y-01 | Works with `NO_COLOR`, 16-color, screen-reader plain mode | Tests |
| NFR-MAINT-01 | Coverage: core/providers/config/tools ≥ 85% lines; ui ≥ 60% | CI-enforced |
| NFR-MAINT-02 | Files ≤ 400 lines, functions cyclomatic ≤ 15 | ESLint-enforced |
| NFR-DIST-01 | Install size (excluding REA) ≤ 25 MB | Pack check |

## 4. Assumptions and open decisions (human sign-off needed at G0)

| # | Assumption | Fallback if rejected |
|---|---|---|
| A1 | License MIT | Apache-2.0 (needs NOTICE handling) |
| A2 | npm name `reengine-cli` is free | `@reengine/cli`; binary names unchanged |
| A3 | Bundling `rea-agents` as an exact-pinned dependency is acceptable | Optional peer + `engine install` command |
| A4 | Windows is supported for ReEngine itself; REA feature availability on Windows follows REA's own matrix | Mark Windows "beta" in README |
| A5 | Update check against npm registry is default-on, notify-only, opt-out | Default off |
