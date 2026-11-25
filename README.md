# ReEngine CLI (`reengine`)

Model-agnostic reverse-engineering terminal harness embedding **REA** (`rea-agents`) as a supervised built-in MCP engine with an Ink/React terminal UI and headless JSON/NDJSON automation mode.

## Quick Start

```bash
npm install -g reengine-cli
reengine setup
reengine doctor
reengine
```

Headless analysis:
```bash
reengine run "Inspect main.js and list IPC handlers" --target ./app --output json
```

## Key Features
- **Zero-config REA Engine**: Embeds `rea-agents` as one supervised stdio MCP child process per session (`reengine engine doctor`).
- **Model & Router Agnostic**: Works with Anthropic, OpenAI, Google Gemini, OpenRouter, Ollama, or any OpenAI-compatible endpoint (`reengine providers presets`).
- **Security First**: Ask-first permissions, taint guard on untrusted artifacts/MCP outputs, project trust gating, scrubbed subprocess environments, and secret references (`env:`, `file:`, `keychain:`).
- **Themeable TUI**: 5 built-in themes (`reengine-dark`, `reengine-light`, `high-contrast`, `mono`, `solarized`), WCAG contrast checker, and exports for Kitty, WezTerm, Alacritty, Ghostty, iTerm2, Windows Terminal, and VS Code.

## Commands
- `reengine` — Launch interactive TUI
- `reengine run <prompt>` — Headless turn (`text`, `json`, `stream-json`)
- `reengine setup` — Initialize config
- `reengine doctor [--json]` — Environment & REA diagnostics
- `reengine providers ...` / `reengine models [provider]` — Manage model providers
- `reengine theme list|set|validate|export` — Manage themes
- `reengine report [--session <id>]` — Export Markdown report
- `reengine sessions list|show|delete|prune` — Manage saved sessions

See [Getting Started](docs/user/getting-started.md) and [SECURITY.md](SECURITY.md) for details.
