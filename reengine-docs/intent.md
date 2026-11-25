# intent.md — Why ReEngine CLI Exists

## 1. One-sentence intent

**ReEngine CLI makes reverse engineering with AI agents a one-install, one-command experience: bring any model, get REA built in, watch the backend work in a clean, fully themeable terminal UI.**

## 2. The problem

- **REA** (Reverse Engineer Anything) is a powerful MCP server + CLI for inspecting native binaries, JavaScript/Electron apps, .NET assemblies, APKs, websites, network captures, firmware and more, returning findings *with evidence and limitations*. But today the user must already own an MCP-capable agent, run `npx rea-agents setup`, configure analysis providers (Hopper/Ghidra/IDA/JADX…), and interpret raw tool output inside a chat UI that was designed for *coding*, not investigation.
- **General coding harnesses** (Claude Code, Gemini CLI, OpenCode/Crush) have excellent UX, but each is tied to a vendor, a model family, or a workflow that treats MCP tools as second-class and has no concept of *targets*, *evidence*, or *engine health*.
- **Result:** the gap between "I want to know how this feature works" and "I have a trustworthy answer" is wide, fragile, and model-locked.

## 3. The product

A single CLI — `reengine` (alias `ree`) — that:

1. **Connects to anything with an LLM endpoint**: OpenAI-compatible APIs (OpenRouter, LiteLLM, Ollama, LM Studio, vLLM, Groq, Together, DeepSeek, Mistral, Azure…), Anthropic, and Gemini — added by config or wizard, never by code changes.
2. **Embeds REA as a managed engine**: resolved, version-pinned, launched, health-checked, restarted and explained automatically. The user never writes MCP JSON for REA.
3. **Accepts any other MCP server** (stdio / streamable HTTP) as a first-class citizen.
4. **Shows the backend honestly**: live tool activity, engine status, progress, evidence with *observed / inferred / unknown* status, never a spinner that hides work.
5. **Is yours to restyle**: semantic theme tokens, density, borders, glyph sets, keybindings, layout toggles, plus a terminal-profile exporter for font family/size.
6. **Works headless** for CI and scripting with stable JSON output and exit codes.

## 4. Who it is for

| Persona | Need |
|---|---|
| **Researcher** (malware/vuln/RE analyst) | Fast, auditable, local-first analysis with evidence they can cite |
| **Product engineer** | "Understand how that feature in app X works, then help me build my own" — without becoming an RE expert |
| **Operator / CI owner** | Reproducible headless runs, JSON output, deterministic exit codes, containers |
| **Tinkerer / power user** | Own model, own router, own theme, own MCP tools |

## 5. Principles (tie-breakers when requirements collide)

1. **Truthful by construction.** Findings carry evidence; unknowns stay unknown; the UI never upgrades "inferred" to "observed."
2. **Flexible by configuration, not by forks.** Anything a user would plausibly swap (model, router, theme, keybinding, engine provider, MCP server) is configuration.
3. **Safe by default, powerful on demand.** Ask-first permissions, trust gates, taint guard — each explicitly relaxable, never silently relaxed.
4. **Minimal surface, deep polish.** Few concepts, each finished. Fewer features than competitors is acceptable; broken features are not.
5. **Boring, inspectable internals.** JSONL sessions, JSONC config, plain files. A user can `cat` their way out of any problem.
6. **Local-first, zero telemetry.**
7. **Deterministic to test.** Every behavior must be testable without a real LLM, a real REA install, or a real network.

## 6. Success definition for v1.0

Measured, not felt:

- **Time-to-first-analysis ≤ 5 minutes** from `npm i -g` on a clean machine with Node installed, for a JavaScript/Electron target (no native engine needed).
- **Any supported provider** completes a tool-using conversation (streamed text, parallel tool calls, cancel, resume) through the *same* contract test suite.
- **REA contract drift is caught in CI**, not by users.
- **No known S1–S3 defects** at release; all budgets in `precise-scale-index.md` §4 met on macOS, Linux, Windows.
- A user can restyle every color, border, glyph set and keybinding **without editing source**.

## 7. Non-goals (v1.0)

- Not an IDE, editor, or GUI/web app. (A terminal UI only.)
- No cloud service, accounts, sync, or hosted backend.
- No subagents/swarms, no plugin marketplace, no hooks system (designed-for, not built).
- No auto-install of third-party RE tools (Ghidra/IDA/Hopper). ReEngine *detects, explains, and links*; the user installs.
- No model fine-tuning, no embeddings/RAG, no image input (designed-for).
- No bypass of target licensing/authorization: ReEngine is a tool for **lawful** analysis; it surfaces REA's disclaimer on first run and records acknowledgement.

## 8. Positioning vs. references (inspiration, not imitation)

| Reference | We take (ideas only) | We deliberately differ |
|---|---|---|
| **Claude Code** (proprietary — no code/prompts/assets copied) | Permission prompts with previews, plan mode, project memory file, slash commands, todo visibility, compaction | Model-agnostic; engine-first; evidence-aware UI |
| **Gemini CLI** (Apache-2.0, TS/Ink) | Layered settings, themes, trusted folders, `GEMINI.md`-style memory, headless JSON | Provider-neutral core; REA built in; semantic tokens |
| **OpenCode `opencode-ai/opencode`** (Go; archived 2025-09-18, continued as **Crush** by Charm) | Provider/agent config shape, auto-compaction, `-p` non-interactive mode with JSON output, session switcher | TypeScript/Node to align with REA; stricter permission model |
| **REA** (MIT) | Entire analysis core, Evidence model, workflow instructions, snapshots | Wrapped and supervised, not reimplemented |

> Note: another actively developed project is also named "opencode" (different codebase). The repository linked in the brief is the archived Go one. Treat it as historical UX reference only.

## 9. Responsible use

REA's README states it provides tools for lawful reverse-engineering research and that users are responsible for authorization. ReEngine inherits that stance: first-run notice, acknowledgement stored locally, included in `--help` footer for `engine` commands, and reflected in the system prompt (authorized targets only; no assistance building malware, evading licensing on targets the user does not own or have rights to analyze).
