# Gate G6 Security Review (SK-14)

- **Honest Evidence Labels:** `EvidenceBadge` renders `observed`, `inferred`, and `unknown` separately; no UI path upgrades `inferred` to `observed`.
- **Report Export:** `reengine report` writes markdown containing only persisted session transcript and evidence records without fabricating unverified claims.
- **First-Run Gate:** Interactive mode refuses to start with exit code 2 when no model is configured, directing the user to `reengine setup` or `--model`.
- **Result:** PASS.
