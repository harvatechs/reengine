# REA CLI Fixtures (`rea-agents@6.4.0`)

- **Captured:** 2026-11-25
- **Package:** `rea-agents@6.4.0` (MIT)
- **Node.js:** `v24.15.0` (`win32` / `x64`)
- **Redactions:** Replaced `C:\Users\zoltr` with `C:\Users\<USER>`.

## Files & Observed Exit Codes

| File | Command | Exit Code |
|---|---|---|
| `help.txt` | `node rea.mjs --help` | `0` |
| `providers.json` | `node rea.mjs providers --format json` | `0` |
| `capabilities.json` | `node rea.mjs capabilities --format json` | `0` |
| `mcp-doctor.json` | `node rea.mjs mcp doctor --format json` | `0` |
| `doctor.json` | `node rea.mjs doctor --format json` | `1` (unconfigured optional providers) |
| `doctor-ghidra.json` | `node rea.mjs doctor --provider ghidra --format json` | `0` |
| `analyze-js-app.json` | `node rea.mjs analyze-javascript-application test/fixtures/js-app --format json` | `0` |

## Key Observed Facts
1. Output format flag is `--format json` (not `--json` as guessed in `integrations-spec.md` §3.1).
2. MCP stdio server flag is `--mcp` (`rea --mcp`), while `rea mcp` is a command group (`add`, `doctor`).
3. Progress is emitted to stderr as NDJSON `{"rea_progress":{"phase":...,"completed":...,"total":...,"message":...,"sequence":...}}`.
