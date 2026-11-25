# Changelog

## 1.0.0 (2026-11-25)
- Initial production release of **ReEngine CLI** (`reengine` / `ree`).
- Supervised single-process REA (`rea-agents@6.4.0`) MCP engine integration with 170-tool permission policy and `observed`/`inferred`/`unknown` evidence adapter.
- Universal LLM adapters (`openai-compatible`, `anthropic`, `gemini`) with 12 built-in provider presets and JSONC layered configuration.
- Ink 5 / React 18 terminal UI with 5 built-in themes, WCAG contrast validation, 7 terminal profile exporters, ANSI/C0/C1 sanitization, assembly syntax highlighting, Inspector (`Ctrl+G`), and DetailViewer (`Ctrl+O`).
- Headless runner (`reengine run --output text|json|stream-json`), session persistence/compaction, artifact spill-to-disk, `reengine doctor`, `reengine report`, and `reengine setup`.
