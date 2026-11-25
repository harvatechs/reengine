# Gate G1 Security Review (SK-14)

**Date:** 2026-11-25
**Scope:** Phase 1 Foundation (`src/util`, `src/platform`, `src/config`, `src/core/contracts.ts`, `src/cli`)

## Checklist
1. **Secret Handling (`NFR-SEC-01`):**
   - `SecretRedactor` masks `sk-ant-*`, `sk-*`, `Bearer ...`, `x-api-key`, and registered runtime secrets across text, objects, and file logs (`test/unit/util/util.test.ts`).
   - `resolveSecret` registers resolved secrets immediately, warns on `SECRET_LITERAL` in user config, rejects literal secrets in project config (`SECRET_LITERAL_FORBIDDEN`), and `formatConfigForDisplay` masks literals (`test/unit/config/secrets.test.ts`, `test/unit/config/config.test.ts`).
2. **Environment Scrubbing (`NFR-SEC-04`):**
   - `buildScrubbedEnv` strips `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, and all non-allowlisted variables (`test/unit/platform/platform.test.ts`).
3. **Folder Trust Gate (`NFR-SEC-05`):**
   - `checkFolderTrust` / `sanitizeProjectConfig` strip `mcpServers`, `engine.rea.{command,args,env}`, `permissions.allow`, and `providers.*.{baseUrl,headers}` when untrusted; ignore `permissions.mode="bypass"` in project config; and re-prompt when the gated-subset SHA-256 hash changes (`test/unit/config/trust.test.ts`).
4. **URL & Reserved Key Enforcement:**
   - `ConfigSchema` rejects non-loopback `http:` `baseUrl` unless `allowInsecure: true`, rejects `mcpServers.rea`, and restricts `engine.rea.env` to `REA_*` keys (`test/unit/config/config.test.ts`).
5. **Layering & Boundary Isolation:**
   - `depcruise` verifies 0 boundary violations across 33 modules and 55 dependencies.

**Verdict:** PASS
