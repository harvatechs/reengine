# decisions.md — Architecture Decision Records

Format: **Context → Decision → Alternatives rejected → Consequences → Revisit trigger.** Status of all below: *Accepted* (pending G0 confirmation where marked). Changing one requires an S4 Change Proposal.

---

### ADR-001 — TypeScript on Node.js, ESM-only
- **Context:** REA is a Node/npm package requiring Node `22.x ≥22.19`, `24.x ≥24.11`, or `26+`. Gemini CLI is TypeScript/Ink. Our users already have Node if they use REA.
- **Decision:** TypeScript (strict), ESM, same Node support window as REA. Distribute via npm.
- **Rejected:** Go/Rust (excellent binaries, but re-implementing MCP/REA glue, Ink-class UI ecosystem and npm-native REA integration costs more; REA bundling becomes awkward). Bun/Deno runtime (REA support matrix and Windows risk).
- **Consequences:** One toolchain for CLI + REA. Startup time needs lazy-loading discipline (budgets in scale index).
- **Revisit:** If startup budgets cannot be met (S4).

### ADR-002 — Ink (React) for the TUI
- **Context:** Need rich layout, live regions, overlays, testability, theming.
- **Decision:** Ink + our own components; `<Static>` for finalized output; `ink-testing-library` for tests.
- **Rejected:** Raw ANSI/readline (re-invents layout/test infrastructure), blessed-style libraries (stale), Go Bubble Tea (language mismatch).
- **Consequences:** Must follow the Static/live discipline (ui §5). Re-render costs managed by batching.
- **Revisit:** If P0-07 spike shows unfixable flicker on Windows Terminal (S4).

### ADR-003 — Single npm package with enforced internal layers
- **Decision:** One package; `src/` layers enforced by dependency-cruiser (specs §3.2).
- **Rejected:** pnpm/npm workspaces monorepo (publish/versioning overhead, cross-package drift risk for AI-driven development).
- **Consequences:** Simpler release; extraction to packages later is mechanical because layers are already isolated.
- **Revisit:** When an SDK/headless library is a product goal.

### ADR-004 — Own provider adapters on fetch/undici; no vendor SDKs, no AI-SDK abstraction
- **Context:** "Any model/router" requires control over custom headers, query params, tool-call streaming quirks of lax OpenAI-compatible servers, retry semantics.
- **Decision:** Three adapters (`openai-compatible`, `anthropic`, `gemini`) with a shared `HttpClient`, our SSE parser, and per-provider `compat` flags.
- **Rejected:** Vendor SDKs per provider (N dependencies, hidden retry/streaming behavior, harder fault injection); Vercel AI SDK (fast to start, but adds a fast-moving abstraction between us and wire behavior we must control, version churn).
- **Consequences:** More code we own and must test thoroughly (shared contract suite mitigates). Wire details come from captured fixtures (P0-06).
- **Revisit:** If maintenance cost of adapters exceeds benefits after 1.0.

### ADR-005 — Official MCP TypeScript SDK as the client
- **Decision:** `@modelcontextprotocol/sdk` for stdio/HTTP/SSE transports, progress, cancellation.
- **Rejected:** Hand-rolled JSON-RPC (spec churn, bugs).
- **Consequences:** Track SDK versions with contract tests against mock + real REA.

### ADR-006 — REA bundled as exact-pinned dependency; stdio; one process per session
- **Context:** REA moves fast ("frequent bug fixes"); its MCP server speaks stdio (setup registrations keep stdio); it reuses analysis state within a running MCP session.
- **Decision:** `rea-agents` exact-pinned in `dependencies`; resolver prefers bundled entry (spawned via `process.execPath`); supervisor owns lifecycle; nightly drift job + policy completeness test.
- **Rejected:** Requiring user-installed REA (breaks "one install"); `npx` at runtime by default (network/latency/supply chain); REA over HTTP in 1.0 (extra port management; stdio is the documented default); per-call process spawn (loses program reuse).
- **Consequences:** Larger install; ReEngine release cadence follows REA bumps (SK-06). Native engines remain user-installed.
- **Revisit:** If install size/time budgets fail (switch to optional peer + `engine install`).

### ADR-007 — Sessions as JSONL + content-addressed artifacts (no SQLite)
- **Decision:** Append-only JSONL per session; large payloads in `artifacts/<sha256>`.
- **Rejected:** SQLite (native module on 3 OS, opaque files, migration burden) as used by some competitors.
- **Consequences:** Crash-safe, greppable, easy export; listing sessions requires an index cache (rebuildable).
- **Revisit:** If session query needs outgrow file scanning.

### ADR-008 — Config: layered JSONC + Zod, generated JSON Schema, trust gate
- **Decision:** Layers: defaults < user < project < env < flags. JSONC for human editing with comment-preserving writes. Zod is the single schema source; JSON Schema is generated. Project-supplied executable-ish config is trust-gated.
- **Rejected:** YAML/TOML (extra deps, editor schema support weaker than JSON Schema), config in code.

### ADR-009 — Secrets by reference
- **Decision:** `env:`/`file:`/`keychain:` references; literals only in user config with warning; redactor everywhere.
- **Rejected:** Mandatory keychain (native dependency failures), storing plaintext by default.

### ADR-010 — Permission engine: default-ask, taint guard, MCP annotations as hints not authority
- **Decision:** See security §4. MCP `readOnlyHint` etc. are *hints* from possibly untrusted servers; they relax prompts only where the server's `trust` setting or REA's policy table allows.
- **Rejected:** Trusting annotations universally; model-judged approvals.

### ADR-011 — Theming via semantic tokens; fonts via terminal-profile export
- **Decision:** Tokens + `extends` + `colorOverrides`; exporter for font/size/line-height/colors per terminal.
- **Rejected:** Pretending to set fonts in-process; per-component color config (unmanageable); live font control via terminal-specific escapes in 1.0 (fragile).

### ADR-012 — Large tool outputs spill to artifacts
- **Context:** Decompiled output and REA results can be enormous; context is finite; evidence must not be lost.
- **Decision:** Raw output always stored; model sees bounded head/tail + id; `artifact_read/search` tools retrieve slices.
- **Rejected:** Truncating and discarding; sending everything (context blowups).

### ADR-013 — No telemetry
- **Decision:** None. Only user-configured endpoints + opt-out npm version check.
- **Rationale:** Reverse engineering targets and decompiled code are sensitive; trust is the product.

### ADR-014 — License MIT; clean-room with respect to Claude Code
- **Context:** REA is MIT; Gemini CLI is Apache-2.0; Claude Code is proprietary; the archived `opencode-ai/opencode` repo continued as Crush (license must be verified before reuse).
- **Decision:** MIT for ReEngine. Take UX *ideas* only from references. No code, prompt text, or assets copied from Claude Code. Any adaptation of permissively licensed code requires attribution in `THIRD_PARTY_NOTICES.md` and a header comment.
- **Consequences:** Reviewers check provenance of non-trivial code (R-057).

### ADR-015 — Test strategy: mock LLM + mock MCP + fixture-driven REA + real-REA jobs
- **Decision:** Determinism first (testing doc §1–5). Real REA runs in separate CI projects and nightly drift detection.
- **Rejected:** Live-LLM tests in CI (flaky, costly, secret-dependent).

### ADR-016 — CLI parser: commander
- **Decision:** `commander` for subcommands/help/completion hooks.
- **Rejected:** yargs (heavier), custom parser (bug surface).

### ADR-017 — Release via Changesets + npm provenance (OIDC) + GitHub Actions
- **Decision:** See deployment §7.
- **Rejected:** Manual publishes; semantic-release (commit-message coupling is brittle for AI-generated commits).

---

### ADR-018 — Tool calling is required in 1.0 (no prompted-tools fallback)
- **Decision:** Models without native tool calling are rejected with a clear message. A `ToolCallingStrategy` seam is reserved but not implemented.
- **Rationale:** Prompted tool parsing is a large reliability surface; most targeted models/routers support native tools.

### ADR-019 — Evidence is a normalized *view-model* over raw REA payloads
- **Decision:** `EvidenceRecord` is derived by adapters; raw payloads are always retained; unknown shapes fall back to a generic JSON tree and never fabricate status.
- **Rationale:** REA's JSON may evolve; truthfulness requires we never present derived structure as authoritative.
