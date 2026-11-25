# REA Tool Classification Contract (`rea-agents@6.4.0`, 170 Tools)

Derived deterministically from:
- `test/fixtures/rea/6.4.0/mcp/tools.json` (170 MCP tool schemas + annotations)
- `test/fixtures/rea/6.4.0/cli/doctor-ghidra.json` (`identity.catalog.tools` effects + annotations)
- Machine-readable draft policy table: `test/fixtures/rea/6.4.0/mcp/policy-draft.json`

## Summary Counts

| Risk Class | Count | Default Policy (`default` mode) |
|---|---|---|
| `read` | 90 | Auto-allowed via built-in REA `trust: readOnlyAuto` when not writing/executing and inside allowed roots |
| `write` | 25 | Always `ask` (database annotations, evidence export, filesystem writes) |
| `exec` | 17 | Always `ask` (target execution, process capture, firmware/archive extraction, `open_binary`, ADB actions) |
| `network` | 38 | Always `ask` (browser/WebMCP, JEB remote URL, ADB device transport) |
| **Total** | **170** | **100% of REA 6.4.0 catalog classified** |

## Classification Rules (`integrations-spec.md` §3.5 & `security-and-permissions.md` §4.3)
1. Any tool with `launchesProcess` + (`capture_*`, `observe_*`, `start_adb*`, `stop_adb*`, `install_adb*`, `uninstall_adb*`, `push_adb*`, `collect_adb*`, `extract_*`, `open_binary`, `reconcile_*`, `trace_*_action`) or `changesUiState`/`mayDiscardData` → `exec`, `readOnly: false`.
2. Any tool with `accessesNetwork` or web/browser/JEB/ADB transport → `network`, `readOnly: false`.
3. Any tool with `mutatesTarget` or `writesFilesystem` or annotation/export/import writes → `write`, `readOnly: false`.
4. Pure static inspection tools without target execution, network, or mutation → `read`, `readOnly: true`.
5. `pathArgs` are extracted from top-level properties matching `/^(path|file|dir|directory|input_path|output_path|snapshot_path|target|target_path|left_target_path|right_target_path|cwd|artifact_path|bundle_path)$|_(path|file|dir)$/`.
6. Unknown tools (any tool absent from `rea-tool-policy.ts`) fail CI contract check and default to `ask` at runtime.
