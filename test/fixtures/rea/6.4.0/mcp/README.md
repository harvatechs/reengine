# REA MCP Fixtures (`rea-agents@6.4.0`)

- **Captured:** 2026-11-25 via `scripts/capture-rea-contract.ts`
- **Client SDK:** `@modelcontextprotocol/sdk@1.32.2`
- **Server:** `rea@6.4.0` via `node rea.mjs --mcp`
- **Redactions:** Replaced workspace path with `<WORKSPACE>` and user home paths with `<USER>`.

## Files

| File | Content |
|---|---|
| `initialize.json` | Server identity (`rea@6.4.0`) and capabilities (`completions`, `prompts.listChanged`, `tools.listChanged`; no `resources`) |
| `tools.json` | Full 170-tool inventory with JSON Schemas and MCP annotations |
| `prompts.json` | 6 MCP prompts (`investigate_feature`, `compare_application_versions`, `verify_reconstruction`, `trace_crash`, etc.) |
| `resources.json` | `MCP error -32601: Method not found` (resources not supported on REA 6.4.0) |
| `call-js-success.json` | `analyze_javascript_application` output on `test/fixtures/js-app` |
| `call-js-error.json` | `analyze_javascript_application` error envelope on nonexistent path (`isError: true`) |
| `policy-draft.json` | P0-04 classification of all 170 tools (`read`: 90, `write`: 25, `exec`: 17, `network`: 38) |
