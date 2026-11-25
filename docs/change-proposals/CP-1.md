# CP-1: Align REA CLI Flags (`--format json`, `--mcp`) and Pin `rea-agents@6.4.0`
Severity: S3 · Raised by: Architect/Builder · Date: 2026-11-25
Trigger: `test/fixtures/rea/6.4.0/cli/help.txt`, `rea-agents@6.10.1` runtime admission failure on `Node v24.15.0`
Impact: P0-02, P0-03, `integrations-spec.md` §3.1–3.4, `specs.md` §2
Options:
  A) Pin `rea-agents@6.4.0` (matches `specs.md` §1 Node `^22.19.0 || ^24.11.0 || >=26` and runs on `v24.15.0`) and update `integrations-spec.md` to use `--format json` and `--mcp` per real REA CLI. — Low risk, deterministic, reversible.
  B) Upgrade host Node to `>=24.22.1` and pin `6.10.1`. — Blocked in current environment without user toolchain upgrade.
Recommendation: Option A (PROVISIONAL Architect acceptance per Autonomy Contract).
Spec edits required: `docs/spec/integrations-spec.md` §3.1, §3.3, §3.4 (`--mcp`, `--format json`).
Test/fixture edits required: `test/fixtures/rea/6.4.0/**`
Decision (Architect/Human): accepted (PROVISIONAL) · 2026-11-25 · Aligned to real `rea-agents@6.4.0` artifact per `README.md` §3 ("the artifacts win").
