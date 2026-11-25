# Security Policy

## Reporting a Vulnerability
Please report security vulnerabilities privately rather than opening a public GitHub issue.
Include reproduction steps, affected version (`reengine version`), and impact assessment.

## Security Architecture
- **Ask-first permissions**: Default mode requires explicit approval for writes, shell commands, and state-mutating REA MCP tools.
- **Taint guard**: Reading untrusted binaries or external MCP responses marks the session tainted and blocks persistent project-rule escalation.
- **Project trust gate**: Untrusted `.reengine/config.jsonc` files cannot override `mcpServers`, `engine.rea.command`, `providers.*.baseUrl`, or `hooks`.
- **Child environment scrubbing**: Subprocesses receive only a minimal base environment allowlist (`PATH`, `HOME`, `TERM`, etc.) unless explicitly allowlisted.
- **Secret references**: API keys use `env:`, `file:`, or `keychain:` references and are redacted from logs, transcripts, and error output.
- **Terminal sanitization**: Untrusted text is stripped of ANSI escape sequences and C0/C1 control characters before rendering.
