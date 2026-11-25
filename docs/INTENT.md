# Intent — ReEngine CLI

## 1. Product Thesis

Reverse engineering workflows currently fracture across terminal tools, heavy GUI disassemblers, manual MCP JSON configs, and vendor-locked AI coding CLIs. `morluto/rea` solved the **capability layer** by unifying static binary bridges, application analyzers, runtime instrumentation, and an evidence-backed MCP tool surface. **ReEngine CLI** solves the **operator harness layer**: it wraps REA inside a fast, minimal, keyboard-first, Claude-Code-caliber terminal workbench that works out of the box in seconds, connects to **any** LLM or router, keeps raw binary/decompilation noise out of sight until needed, and lets the user customize every aspect of their visual workspace.

## 2. Core Design Pillars

1. **Zero-Friction REA Integration ("One Command, Full Engine"):** Running `reengine` automatically detects or bootstraps the built-in REA MCP backend (`rea-agents`), discovers installed local analysis engines (Ghidra, Hopper, IDA, Kuna, Cutter, GDB, Frida, JADX, Playwright), and surfaces their live health in the UI without manual JSON editing.
2. **Evidence-First UI, Not Raw JSON Dumps:** Reverse engineering produces massive payloads (disassembly listings, AST dumps, CDP traces, symbol tables). ReEngine CLI never floods the chat viewport. It renders compact, collapsible **Tool Execution Cards** with live elapsed timers, byte/symbol counts, and expandable **Evidence & Coverage Drawers** backed by REA's evidence model.
3. **Radical Model & Engine Freedom:** No vendor lock-in. Users can swap between Anthropic, OpenAI, Google Gemini, OpenRouter, Groq, DeepSeek, local Ollama, `llama.cpp` / `llama-server`, LiteLLM, or any OpenAI/Anthropic-compatible proxy mid-session via `/model`, and even assign distinct models to *Planning* vs. *Fast Tool-Triage* roles.
4. **Total Workspace Customizability (With Terminal Honesty):** Full runtime customization over color palettes (24-bit TrueColor HEX), semantic syntax colors, border geometries, layout density (`compact`, `balanced`, `spacious`), icon sets (Nerd Font / Unicode / pure ASCII), and font-size/typeface profiles via terminal-native profile bridges and OSC integrations.
5. **Deterministic Production Craftsmanship:** Every subsystem is built with strict TypeScript types, Zod runtime validation, structured error taxonomies, clean process teardown (zero zombie MCP processes), and deterministic automated tests.

## 3. Non-Goals for v1.0 MVP

* Replacing Ghidra/IDA's full interactive graph GUI (ReEngine orchestrates them via REA, not re-implements a native x86/ARM decompiler).
* Cloud-hosted multi-tenant SaaS accounts or mandatory telemetry (100% local-first, privacy-respecting).
* Offensive exploit-generation automation (ReEngine is a general-purpose reverse engineering, auditing, interoperability, and software analysis harness with explicit safety gates).
