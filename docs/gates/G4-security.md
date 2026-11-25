# Gate G4 Security Review (SK-14)

**Date:** 2026-11-25
**Scope:** Phase 4 MCP & REA Engine (`src/mcp/`, `src/engine/`, `src/app/engine-service.ts`, `src/cli/commands/{engine,mcp}.ts`)

## Checklist
1. **REA & MCP Child Env Scrubbing (`NFR-SEC-04`):**
   - `McpManager` builds stdio child env via `buildScrubbedEnv`, stripping provider API keys and non-allowlisted vars.
2. **Untrusted Output & Taint Propagation (`NFR-SEC-03`):**
   - All MCP/REA tools default to `openWorld: true` unless classified read-only static in `rea-tool-policy.json`; `openWorld` tool outputs set session taint and are wrapped in `<untrusted_tool_output>` with closing-tag ZWJ neutralization.
3. **REA Policy Completeness (`integrations-spec.md` §3.5):**
   - `test/unit/engine/policy-evidence-targets.test.ts` verifies 170/170 tools in `test/fixtures/rea/6.4.0/mcp/tools.json` are classified; `exec`/`network` tools remain non-readOnly and ask-gated.
4. **Reserved Server Name & Project Trust:**
   - `addMcpServerConfig` and `ConfigSchema` reject server name `rea`; untrusted project `mcpServers` and `engine.rea.{command,args,env}` remain stripped by `sanitizeProjectConfig`.
5. **Orphan-Free Shutdown:**
   - `ReaSupervisor.stop()` and `McpManager.closeAll()` terminate child transports cleanly (`test/integration/engine/rea-real.test.ts` verified state returns to `absent`).

**Verdict:** PASS
