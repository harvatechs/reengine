# Getting Started with ReEngine CLI

## 1. First-Time Setup
Run `reengine setup` to initialize your user configuration file (`config.jsonc`).
Set your provider API key via an environment variable (e.g., `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, or `OPENROUTER_API_KEY`) and configure a default model:

```bash
reengine providers add openrouter --preset openrouter --api-key-ref env:OPENROUTER_API_KEY
reengine config set model.default openrouter/anthropic/claude-3.7-sonnet
reengine doctor
```

## 2. Interactive TUI
Launch `reengine` in your project directory:
- `Enter`: send message
- `Shift+Tab`: cycle permission mode (`plan`, `default`, `acceptEdits`)
- `Ctrl+G`: toggle Inspector (engine status, targets, token usage, evidence)
- `Ctrl+O`: inspect tool output / artifact details
- `Esc` / `Ctrl+C`: cancel active turn or clear input
- `/help`: show keybindings and slash commands

## 3. Themes & Terminal Profiles
```bash
reengine theme list
reengine theme set high-contrast
reengine theme validate high-contrast
reengine theme export --terminal windows-terminal
```
