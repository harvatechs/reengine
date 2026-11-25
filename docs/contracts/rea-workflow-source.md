# REA Agent Workflow Source (P0-05)

- **Source Package:** `rea-agents@6.4.0`
- **Source File:** `node_modules/rea-agents/skills/reverse-engineer-anything/SKILL.md` (skill version `37`, `tool_count: 170`)
- **License:** MIT (`Copyright (c) 2026 morluto`) — recorded in `THIRD_PARTY_NOTICES.md`.

## Core Workflow Rules Vendored for `src/core/prompt/rea-workflow.md`

1. **Trigger discipline:** Use REA when a claim depends on a shipped binary, package, decompilation, passive runtime evidence, or comparison with behavior not established by available source. Skip REA for ordinary source-repository analysis.
2. **Target routing:**
   - ASAR or extracted JavaScript/Electron tree → `analyze_javascript_application`
   - Archive/package member inventory (ZIP/APK/IPA/MSIX/AppX/DMG) → `open_binary` + `inspect_artifact`
   - Android APK → `inspect_android_package`
   - Managed PE/CLI assembly → `inspect_managed_artifact`
   - Firmware image → `inspect_firmware_regions` (only `extract_firmware` when explicitly requested)
   - Offline Linux ELF → `inspect_binary_layout`
   - PE resources → `inspect_pe_resources`
   - Native executable/library → `open_binary` then focused tools (`binary_overview`, `analyze_function`, `procedure_pseudo_code`, `list_strings`, `xrefs`)
3. **Summary-first & artifact paging:** Use `"detail": "summary"` for large JS/ELF analyses, then drill into retained `parent_evidence_id` via `inspect_analysis_view` or `get_evidence_bundle` instead of repeating oversized calls.
4. **Evidence truthfulness:** Every conclusion must distinguish observations, inferences, and unknowns, cite Evidence IDs, preserve limitations and incomplete coverage, and never imply static analysis observed runtime execution.
5. **MCP Prompts (6 captured in `prompts.json`):** `investigate_feature`, `compare_application_versions`, `verify_reconstruction`, `trace_crash`, plus remaining prompts in `test/fixtures/rea/6.4.0/mcp/prompts.json`.
