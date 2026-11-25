# Gate G3 Security Review (SK-14)

**Date:** 2026-11-25
**Scope:** Phase 3 Core, Tools & Permissions (`src/core/`, `src/tools/`, `src/app/run-service.ts`)

## Checklist
1. **Permission Precedence & Taint Guard (`security-and-permissions.md` §4):**
   - `evaluatePermission` enforces mode hiding (`plan` blocks `write`/`exec`/mutating MCP), `deny > path-arg guard > taint guard > ask > allow > mode default`.
   - Wildcard `allow` rules (`shell(*)`) prompt when `tainted: true`; only exact user rules (`shell(git status)`) or session-approved exact actions bypass taint (`test/unit/core/permissions.test.ts`).
2. **Workspace & Symlink Guard (`NFR-SEC-02`):**
   - `resolveSafeWorkspacePath` resolves ancestor realpaths, rejects paths escaping workspace/additional roots, and rejects `/dev/*` and special device files (`test/unit/tools/tools.test.ts`).
3. **Shell Hardening (`NFR-SEC-04`):**
   - `createShellTool` runs with `shell: false`, closed stdin (`ignore`), timeout + process tree kill, and `buildScrubbedEnv` stripping provider keys (`test/unit/tools/tools.test.ts`).
4. **Prompt Injection Defense (`specs.md` §8):**
   - `wrapUntrustedToolOutput` neutralizes `</untrusted_tool_output>` with `\u200D` (`test/unit/core/session-tokens-prompt.test.ts`).
5. **Bypass Guard (`security-and-permissions.md` §4.1):**
   - `resolveEffectivePermissionMode` refuses `--yolo` or `bypass` unless `REENGINE_ALLOW_BYPASS=1` is set.

**Verdict:** PASS
