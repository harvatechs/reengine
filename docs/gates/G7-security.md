# Gate G7 Security Review (SK-14)

- **Security Acceptance Suite (`test/security/security-acceptance.test.ts`):** All security assertions passed:
  - S1/S2: Workspace path guard rejects `..` traversal, `/dev/*`, and Windows device paths (`\\.\PhysicalDrive0`).
  - S3: Untrusted `.reengine/config.jsonc` filters `mcpServers` and sensitive keys until trusted.
  - S4: `SecretRedactor` masks `sk-*`, `Bearer *`, and registered secrets.
  - S5: `sanitizeTerminalText` strips ANSI CSI/OSC and C0/C1 control sequences.
  - S6: `buildScrubbedEnv` strips `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `AWS_SECRET_ACCESS_KEY`.
  - S7/S8: `--yolo` rejected without `REENGINE_ALLOW_BYPASS=1`; unknown REA tools lack auto-allow policy; taint guard enforces `ask` on exec/write.
- **No Secrets or `src/` in Tarball:** `npm publish --dry-run` and `scripts/check-pack.ts` verified 29 files (`963.7 kB`), no `src/`, no `.env`.
- **Result:** PASS.
