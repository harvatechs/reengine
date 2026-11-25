# ReEngine CLI (`reengine` / `ree`)

[![CI](https://github.com/harvatechs/reengine/actions/workflows/ci.yml/badge.svg)](https://github.com/harvatechs/reengine/actions/workflows/ci.yml)
[![CodeQL](https://github.com/harvatechs/reengine/actions/workflows/codeql.yml/badge.svg)](https://github.com/harvatechs/reengine/actions/workflows/codeql.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%5E22.19.0%20%7C%7C%20%5E24.11.0%20%7C%7C%20%3E%3D26-brightgreen)](package.json)

A model-agnostic, security-first reverse-engineering terminal harness that embeds **REA** (`rea-agents`) as a supervised built-in MCP engine, paired with a themeable Ink/React terminal UI and a deterministic headless automation runner.

---

## Table of Contents
- [Features](#features)
- [Installation & Adding to PATH](#installation--adding-to-path)
- [Building a Single Standalone Executable (`.exe`)](#building-a-single-standalone-executable-exe)
- [Quick Start](#quick-start)
- [Commands Reference](#commands-reference)
- [Themes & Terminal Profiles](#themes--terminal-profiles)
- [Security Architecture](#security-architecture)
- [Development & Verification](#development--verification)

---

## Features
- **Single-Command Access (`reengine` / `ree`)**: Launch directly from any directory on your terminal `PATH`, just like `opencode` or `claude`.
- **Standalone Single Executable (`reengine.exe`)**: Compile into a self-contained Node Single Executable Application (SEA) with bundled prompt templates and JSON schemas.
- **Built-in Supervised REA Engine**: Embeds `rea-agents` as one supervised stdio MCP child process per session (`reengine engine doctor`) with a 170-tool permission policy and `observed` / `inferred` / `unknown` evidence normalization.
- **Model & Router Agnostic**: Works with OpenAI, Anthropic, Google Gemini, OpenRouter, Ollama, LM Studio, or any OpenAI-compatible endpoint (`reengine providers presets`).
- **Interactive TUI & Headless Mode**: Ink 5 / React 18 TUI with `<Static>` transcript history, assembly syntax highlighting, Inspector (`Ctrl+G`), DetailViewer (`Ctrl+O`), and headless `text` / `json` / `stream-json` (NDJSON) output.
- **Restrictive Security Defaults**: Ask-first permissions, taint guard on untrusted binaries/MCP outputs, project trust gating, scrubbed child environments, and `env:` / `file:` / `keychain:` secret references.

---

## Installation & Adding to PATH

### Option A: Single Executable on PATH (Recommended on Windows)
Building the standalone executable automatically places `reengine.exe` and `ree.exe` into `%USERPROFILE%\.reengine\bin`:

```powershell
npm ci
npm run build:exe
```

If `%USERPROFILE%\.reengine\bin` is not already on your User `PATH`, add it once in PowerShell:

```powershell
$bin = "$env:USERPROFILE\.reengine\bin"
$current = [Environment]::GetEnvironmentVariable('PATH', 'User')
if ($current -notlike "*$bin*") {
  [Environment]::SetEnvironmentVariable('PATH', "$bin;$current", 'User')
}
```

Open a new terminal and verify from any directory:

```powershell
reengine version
ree --help
```

### Option B: Global npm Install (Cross-Platform)
```bash
npm install -g .
reengine version
```

---

## Building a Single Standalone Executable (`.exe`)

`scripts/build-exe.mjs` bundles the CLI (`src/cli/main.ts`), prompt markdown modules (`src/core/prompt/*.md`), and config JSON Schema (`schemas/config.v1.schema.json`) into a single Node SEA binary:

```bash
npm run build:exe
```

Outputs:
- `dist-exe/reengine.exe` — standalone executable
- `%USERPROFILE%\.reengine\bin\reengine.exe` — installed on User `PATH`
- `%USERPROFILE%\.reengine\bin\ree.exe` — short alias on User `PATH`

Requirements: Node.js `^22.19.0 || ^24.11.0 || >=26`.

---

## Quick Start

1. **Initialize configuration:**
   ```bash
   reengine setup
   ```
2. **Add a model provider & set your default model:**
   ```bash
   reengine providers add openrouter --preset openrouter --api-key-ref env:OPENROUTER_API_KEY
   reengine config set model.default openrouter/anthropic/claude-3.7-sonnet
   ```
3. **Check environment & REA engine health:**
   ```bash
   reengine doctor
   ```
4. **Launch interactive TUI:**
   ```bash
   reengine
   ```
5. **Run headless analysis:**
   ```bash
   reengine run "Inspect main.js and list IPC handlers" --target ./app --output json
   ```

---

## Commands Reference

| Command | Description |
|---|---|
| `reengine [prompt]` | Launch interactive Ink TUI (optionally with an initial prompt) |
| `reengine run <prompt>` | Run a headless turn (`--output text\|json\|stream-json`, `--target`, `--model`) |
| `reengine setup` | Initialize user config (`config.jsonc`) |
| `reengine doctor [--json]` | Run Node.js, terminal, config, trust, and REA engine diagnostics |
| `reengine providers ...` | List presets, add/test/remove providers (`reengine providers presets`) |
| `reengine models [provider]` | List available models from configured providers |
| `reengine engine status\|doctor` | Inspect bundled/PATH REA engine state |
| `reengine theme list\|set\|validate\|export` | Manage themes and export terminal color profiles |
| `reengine report [--session <id>]` | Export Markdown analysis report from a session |
| `reengine sessions list\|show\|delete\|prune` | Manage persisted sessions |
| `reengine config get\|set\|list\|path\|schema\|validate` | Inspect and edit layered JSONC configuration |
| `reengine completion <bash\|zsh\|fish\|powershell>` | Generate shell completion scripts |
| `reengine version` | Print CLI, REA, Node.js, and platform versions |

---

## Themes & Terminal Profiles

Built-in themes: `reengine-dark` (default), `reengine-light`, `high-contrast`, `mono`, `solarized`.

```bash
reengine theme list
reengine theme set high-contrast
reengine theme validate high-contrast
reengine theme export --terminal windows-terminal
```

Supported terminal profile exporters: `kitty`, `wezterm`, `alacritty`, `ghostty`, `iterm2`, `windows-terminal`, `vscode`.

---

## Security Architecture

- **Ask-First Permissions**: Default mode requires explicit approval for file writes, shell commands, and state-mutating REA MCP tools.
- **Taint Guard**: Reading untrusted binaries or external MCP responses marks the session tainted and blocks persistent project-rule escalation.
- **Project Trust Gate**: Untrusted `.reengine/config.jsonc` files cannot override `mcpServers`, `engine.rea.command`, `providers.*.baseUrl`, or `hooks`.
- **Child Environment Scrubbing**: Spawned tools and MCP servers receive only a minimal base environment allowlist unless explicitly configured.
- **Secret References & Redaction**: API keys use `env:`, `file:`, or `keychain:` references and are automatically redacted from logs and output.
- **Terminal Sanitization**: Untrusted text is stripped of ANSI CSI/OSC escapes and C0/C1 control characters prior to rendering.

See [SECURITY.md](SECURITY.md) and [docs/user/getting-started.md](docs/user/getting-started.md) for more details.

---

## Development & Verification

```bash
npm ci
npm run verify
```

`npm run verify` runs strict TypeScript typechecking, ESLint (`complexity <= 15`, `max-lines <= 400`, `no-ui-literals`, `no-console`), Prettier, `dependency-cruiser` layer boundary checks, `knip`, JSON Schema parity, Vitest + coverage, `tsup` build, and `pack:check`.

---

## Contributing & License

- See [CONTRIBUTING.md](CONTRIBUTING.md) for architecture boundaries and contribution guidelines.
- See [SECURITY.md](SECURITY.md) for reporting vulnerabilities.
- Released under the [MIT License](LICENSE). See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for third-party attributions.
