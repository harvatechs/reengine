# Gate G2 Security Review (SK-14)

**Date:** 2026-11-25
**Scope:** Phase 2 Providers (`src/providers/`, `src/app/providers-service.ts`, `src/cli/commands/providers.ts`)

## Checklist
1. **Transport & TLS (`NFR-SEC-01`, `integrations-spec.md` §1.5):**
   - `HttpClient` uses `undici` `EnvHttpProxyAgent` when proxy env vars are set and respects `NODE_EXTRA_CA_CERTS`.
   - HTTP logging logs metadata only (`host`, `path`, `status`, `durationMs`), never auth headers or request/response bodies.
2. **Pre-First-Byte Retry & Abort:**
   - Retries only occur before the first streamed byte on `408`/`429`/`5xx`/network errors; `401`/`403` fail immediately as non-retryable `auth` errors (`test/unit/providers/http.test.ts`).
   - `AbortSignal` propagates cleanly through `fetchWithRetry` and `parseSseStream`.
3. **Secret & Config Hygiene:**
   - `probeProviderModels` resolves secrets via `resolveSecret` and registers them with `SecretRedactor`.
   - `addConfiguredProvider` writes secret references (`env:`), never plaintext keys.

**Verdict:** PASS
