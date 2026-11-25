# integrations-spec.md — Providers, MCP, and the REA Engine

## Part 1 — Model provider layer (`src/providers/`)

### 1.1 Design

- Hexagonal port: `ModelProvider` (specs §4). Three adapters ship; **all "any model / any router" flexibility comes from config on top of them**.
- Adapters are written on `undici`/`fetch` + our own SSE parser. No vendor SDKs, no Vercel AI SDK (ADR-004): we need control over tool-call streaming quirks, custom headers/query params, and per-provider compat flags.
- Wire formats are **not** specified in this repository's docs. P0-06 fetches the *current official API documentation* for each protocol, records the facts in `docs/contracts/wire-<type>.md`, and captures redacted real (or documented) stream fixtures under `test/fixtures/providers/<type>/`. Adapters are implemented against those artifacts.

### 1.2 Adapter types

| `type` | Covers | Notes |
|---|---|---|
| `openai-compatible` | OpenAI Chat Completions-style endpoints: OpenAI, OpenRouter, LiteLLM, Ollama (`/v1`), LM Studio, vLLM, llama.cpp server, Groq, Together, DeepSeek, Mistral, Azure (via `queryParams` + `auth`), most gateways | Quirks handled by `compat` flags |
| `anthropic` | Anthropic Messages API (and gateways exposing it) | Thinking blocks with signatures, prompt caching |
| `gemini` | Google Generative Language API (`streamGenerateContent`) | Function calling, thinking config |

### 1.3 Provider config (schema in `config-reference.md`)

```jsonc
"providers": {
  "openrouter": {
    "type": "openai-compatible",
    "baseUrl": "https://openrouter.ai/api/v1",
    "auth": { "type": "bearer", "key": "env:OPENROUTER_API_KEY" },
    "headers": { "X-Title": "ReEngine CLI" },
    "queryParams": {},
    "compat": {
      "maxTokensParam": "max_tokens",       // or "max_completion_tokens"
      "systemRole": "system",               // or "developer"
      "streamUsage": true,                  // send stream_options.include_usage
      "toolChoice": "auto",                 // "auto" | "required" | "omit"
      "parallelToolCalls": true,
      "toolCallArgsStyle": "incremental",   // "incremental" | "whole" (some servers send full args in one chunk)
      "emptyToolContentPlaceholder": "(no output)",
      "reasoningParam": "reasoning_effort"  // or "reasoning" (object) or "none"
    },
    "timeouts": { "connectMs": 30000, "idleMs": 60000, "totalMs": 900000 }
  }
}
```

`compat` defaults are chosen per preset; unknown servers get conservative defaults and the user can flip flags without code. `providers test <id>` runs a **capability probe**: (1) auth + `GET /models`, (2) tiny streamed completion, (3) tiny tool-call round-trip. Results are shown (`✓ stream  ✓ tools  ✗ parallel tools`) and may auto-suggest `compat` changes.

### 1.4 Model references and registry

- Model ref: `<providerId>/<modelId>`; split on the **first** `/` only (OpenRouter ids contain slashes). Bare `modelId` is resolved against the default provider.
- Capabilities resolution order: user override (`providers.<id>.models.<modelId>`) → discovery payload fields (e.g. context length when the endpoint exposes it) → preset defaults → global defaults (128k window, 8k output, tools on) with a one-time warning.
- A model with `tools: false` fails fast with `ProviderError('unsupported')` and an actionable message — **prompted-tools fallback is out of scope for 1.0** (designed-for: `ToolCallingStrategy` seam).

### 1.5 Transport behavior (all adapters share `HttpClient`)

| Concern | Rule |
|---|---|
| Proxy/CA | `undici` `EnvHttpProxyAgent` (HTTP(S)_PROXY, NO_PROXY); respect `NODE_EXTRA_CA_CERTS` |
| Timeouts | connect 30 s; **idle-stream** 60 s (resets on every byte, including SSE comments/pings); total 15 min; all overridable per provider |
| Retry | Before the first streamed byte only: `429`, `408`, `5xx`, network resets. Exponential backoff 1 s·2ⁿ + jitter (±25%), honor `Retry-After`, max 4 attempts. **Never retry after streaming began**; surface `ProviderError` with partial content preserved in session |
| Errors | Map status/body to `ProviderErrorKind`. Context overflow detection: status 400/413 + provider-specific message patterns (from fixtures) → `context_length` → triggers one forced compaction + retry in the loop |
| Abort | `AbortSignal` closes the socket; stream iterator ends within 500 ms |
| Logging | Request/response metadata only (url host/path, status, timings, token usage). **Bodies are logged only at `trace` level, redacted**, never by default |

### 1.6 SSE parser (`providers/sse.ts`)

Implements the WHATWG event-stream rules: chunk boundaries may split lines/UTF-8 sequences (use a streaming `TextDecoder`), handle `\r\n`, `\n`, `\r`; ignore comments (`:`); multi-line `data:` concatenation with `\n`; `[DONE]` sentinel (openai-style) handled by the adapter, not the parser. 100% branch coverage required; fuzz test with random chunk splitting of recorded streams.

### 1.7 Tool-call stream assembly

Per adapter, convert vendor deltas to `tool_call_start/delta/end` events keyed by `index`. Required behaviors (each has a fixture + test):

1. Single tool call, incremental args.
2. N parallel calls interleaved by index.
3. Args delivered whole in one chunk (`toolCallArgsStyle: 'whole'`).
4. Missing/duplicated `index` or `id` from lax servers → synthesize stable ids (`call_<ulid>`), index by arrival.
5. Tool-call + text in the same turn.
6. Finish with `length` mid-arguments.
7. Empty-args call (`""` or `{}`).
8. Provider returns an id longer than limits or with illegal chars → remap to `^[a-zA-Z0-9_-]{1,64}$` consistently across the request/response round-trip.

### 1.8 Cross-provider history replay

When the active provider changes mid-session, the next request is built from provider-neutral `Message[]`. **Drop** `reasoning` parts whose `providerId` ≠ target provider (signatures are not portable). Tool call/result ids are remapped if the target imposes different constraints. Test: record on Anthropic fixture → replay on OpenAI-compatible fixture and back.

### 1.9 Reasoning normalization (S)

| Level | `anthropic` | `openai-compatible` | `gemini` |
|---|---|---|---|
| off | no thinking param | omit | thinking budget 0 where permitted |
| low/medium/high | `thinking` enabled with budget tokens (tier table in `docs/contracts/wire-anthropic.md`) | `compat.reasoningParam` | `thinkingConfig` budget tier |

The concrete parameter names are taken from P0-06 docs capture, not from this table.

### 1.10 Presets (`providers/presets.ts`)

Each preset = `{ id, label, type, baseUrl, authEnvVar, compat, notes, keyUrl }`. Required: `openai`, `anthropic`, `gemini`, `openrouter`, `ollama` (no auth, `localhost:11434/v1`), `lm-studio` (`localhost:1234/v1`), `litellm` (`localhost:4000`), `groq`, `together`, `deepseek`, `mistral`, `azure-openai` (template requiring resource/deployment inputs). Presets are data validated by the same Zod schema as user providers; a test asserts every preset parses.

---

## Part 2 — MCP client (`src/mcp/`)

### 2.1 Responsibilities

`McpManager` owns N `McpConnection`s (built-in REA is one of them, created via `engine/` supervisor). Built on `@modelcontextprotocol/sdk`.

| Transport | Support |
|---|---|
| stdio | M — command, args, env (merged over scrubbed base), cwd |
| streamable HTTP | M — url, headers (secret refs allowed) |
| SSE (legacy) | S |

### 2.2 Connection lifecycle

States: `disabled → connecting → ready → degraded → reconnecting → failed`. Events published on an internal bus for the UI (Inspector) and logs. Reconnect policy for stdio crashes: up to 3 attempts, backoff 1/3/9 s, then `failed` with the last 50 stderr lines retained. In-flight calls on a crashed connection resolve to error results (`MCP_CONNECTION_LOST`), never hang.

### 2.3 Tool ingestion

1. `tools/list` (paginated) → for each tool create a `Tool` adapter:
   - `name = mcp__<server>__<tool>` sanitized to `^[a-zA-Z0-9_-]+$`; if > 64 chars → truncate and append 8-char hash; collisions resolved by hash suffix. Mapping table kept both ways.
   - `risk`: `'mcp'`; `readOnly` from `annotations.readOnlyHint === true`; `destructive` from `destructiveHint !== false` when not read-only; `openWorld` from `openWorldHint` (default **true** when absent — assume untrusted).
   - `pathArgs`: top-level `string` properties whose names match `/^(path|file|dir|directory|input_path|output_path|snapshot_path|target|cwd)$|_(path|file|dir)$/` or whose schema has `format: "path"`/description hint — then **overridden** by the server's entry in the tool policy table when one exists (REA: `engine/rea-tool-policy.ts`).
2. Input schemas validated by Ajv at call time; schema compile failures disable that single tool with a warning (not the server).
3. `notifications/tools/list_changed` → re-list, diff, emit `notice` ("3 tools added by <server>"), new tools default to **ask** until classified or approved.

### 2.4 Calls

- Cancellation: `AbortSignal` → SDK request abort + `notifications/cancelled`.
- Progress: pass a `progressToken`; surface `notifications/progress` as `tool_progress`; use `resetTimeoutOnProgress` so long analyses don't time out while alive.
- Timeouts: default per-server `requestTimeoutMs` 120 000; **REA built-in default 600 000** (large-binary imports are slow; REA documents provider startup deadlines).
- Results: concatenate text content blocks; keep `structuredContent` in `ToolOutput.structured`; unsupported content types (image/audio) → placeholder text + stored artifact (images not shown to models in 1.0).
- All MCP output is **untrusted** (wrapped per specs §8).

### 2.5 Prompts and resources

- `prompts/list` → slash commands `/mcp__<server>__<prompt>` with argument prompts built from the prompt's declared arguments. Executing fetches `prompts/get`, inserts returned messages as a user turn.
- `resources/list` + `resources/read` → `@server:uri` completion in the composer (S).

### 2.6 Extra servers (user)

Configured under `mcpServers` (user or project). **Project-level servers require trust** (security §3). `mcp add` supports `--transport stdio|http|sse`, `--env K=V`, `--header K=V`, `--scope user|project`. `mcp doctor` performs handshake, lists tools/prompts counts, measures list latency.

---

## Part 3 — REA engine (`src/engine/`)

### 3.1 What REA is (verified from public sources; re-verify in P0)

REA (`morluto/rea`, MIT, npm `rea-agents`) is an MCP server **and** CLI for reverse engineering: native binaries (via Hopper, Ghidra, IDA, Kuna), JavaScript/Electron apps, .NET assemblies, Android APKs/devices (JADX, adb, Apktool, JEB via `REA_JEB_MCP_URL`), websites, network captures (HAR/mitmproxy), firmware (Binwalk/Unblob), process behavior, EVM bytecode and more. Results carry **Evidence** with limitations. Documented CLI surface relevant to us: `rea mcp` (stdio), `rea mcp --http --port <n>`, `rea mcp doctor --json`, `rea providers --json`, `rea capabilities --json`, `rea doctor --provider <id> --json`, `rea analyze <path> --provider <id> [--snapshot <file>]`, `rea update`, `rea setup`. MCP `open_binary` accepts `provider_id` (concrete id or `auto`) and `snapshot_path`. Environment variables include `REA_ANALYSIS_PROVIDER`, `REA_GHIDRA_STARTUP_TIMEOUT_MS`, `REA_HOPPER_STARTUP_TIMEOUT_MS`, `REA_GHIDRA_PROJECT_PATH`, `REA_JEB_MCP_URL`, `REA_MCP_INPUT_SCHEMA_PROFILE`, `REA_MCP_OUTPUT_SCHEMA_PROFILE` (compact vs full). Requires Node `22.x ≥22.19`, `24.x ≥24.11`, or `26+`. REA states analysis runs locally and the *agent's model provider* receives tool results.

> Anything beyond the list above (tool names, argument names, Evidence JSON, MCP prompts) is **unknown until P0-02…P0-05 capture it.**

### 3.2 Resolution (`engine/resolver.ts`)

Order, first success wins, each step logged:

1. `engine.rea.command` (+`args`) from config — user override.
2. **Bundled**: `require.resolve('rea-agents/package.json')` → read `bin` → absolute JS entry; spawn with `process.execPath`. (No PATH dependence, works on Windows.)
3. `rea` on PATH with `rea --version` ≥ `engine.rea.minVersion` (from our pinned contract).
4. `npx -y rea-agents@<pinned> mcp` (requires network; used only if 2 fails and user opted in via `engine.rea.allowNpx`).

Failure ⇒ `EngineUnavailable` with remedy text; ReEngine still runs (no REA tools) and `engine:resolved` doctor check fails.

### 3.3 Supervisor state machine (`engine/supervisor.ts`)

```
absent → resolving → starting → ready ⇄ degraded → restarting → ready
                         └──────────────→ failed (after 3 restarts) → (manual `engine restart`)
```

- **Lazy start:** begins in the background at app start (after first paint), or on first REA tool call. The UI never blocks on it.
- **One process per ReEngine session**, reused across all tool calls (REA reuses analysis programs within a session). Never spawned per call.
- Spawn: `process.execPath [reaEntry] mcp`, `stdio: ['pipe','pipe','pipe']`, env = scrubbed base ∪ `REA_*` from `engine.rea.env` ∪ derived (`REA_ANALYSIS_PROVIDER` from `engine.rea.provider` unless `auto`). stdout is owned by the MCP transport; **stderr is captured into a 200-line ring buffer** and surfaced in the Inspector/doctor (never printed to the terminal).
- Handshake timeout 30 s (cold npm/disk) — configurable. `ready` after `initialize` + `tools/list` success.
- Shutdown: close MCP transport → SIGTERM (Windows: `taskkill /T`) → 3 s → SIGKILL tree. Must leave **no orphan** (test: spawn fixture REA stand-in, kill parent, assert child gone).
- Health: `degraded` when a call fails with transport error or stderr shows a documented REA provider failure; periodic `ping` every 30 s while idle (if SDK supports) else on-demand.

### 3.4 Engine doctor (`engine/doctor.ts`)

Runs (with timeouts) `rea mcp doctor --json`, `rea providers --json`, `rea capabilities --json`, and for each configured/selected provider `rea doctor --provider <id> --json`. Output shapes are **taken from P0-02 fixtures**; parsing is Zod-validated with `.passthrough()` for unknown fields; parse failure ⇒ `warn` + raw output attached, never a crash. Produces a human summary: *what works now / what needs which tool / where to get it* (links point to REA's published guides at `rea.tools`).

### 3.5 Tool policy table (`engine/rea-tool-policy.ts`)

Generated in P0-04 from the real catalog, then hand-reviewed. Type:

```ts
export interface ReaToolPolicy {
  name: string;                         // original REA tool name
  risk: 'read' | 'exec' | 'write' | 'network';
  readOnly: boolean;
  longRunning: boolean;                 // use REA timeout, show progress emphatically
  pathArgs: string[];                   // properties holding filesystem paths
  openWorld: boolean;                   // web/network/device/runtime capture
  note?: string;
}
```

Rules: static analysis of local files → `read`; **anything that runs or interacts with the target (process capture, runtime capture, ADB actions, browser navigation, mitm) → `exec`/`network`, `readOnly:false`, always asks** (REA states runtime capture executes the target with the user's permissions). A contract test **fails CI if the live catalog contains a tool absent from the table**, forcing classification on every REA bump.

### 3.6 Targets (`engine/targets.ts`)

A *target* is a user-declared path (file, app bundle, directory, APK, URL for web analysis) the investigation concerns. Stored in the session (`target_add/remove`) and optionally `.reengine/targets.json` for the project.

- Declared via `/targets add <path>`, `--target`, or **implicitly** when the user's own message contains an existing absolute/relative path (prompt-detected; shown as a notice, one keystroke to undo).
- **Path-arg guard:** for any tool call, each path argument (per policy/`pathArgs`) is `realpath`-resolved; allowed if within workspace root, a declared target, or `--add-dir` roots. Otherwise the call escalates to **ask** with the path highlighted (never silently allowed, even in `acceptEdits`).

### 3.7 Evidence adapters (`engine/evidence/`)

```ts
export interface EvidenceAdapter {
  readonly id: string;
  detect(toolName: string, structured: unknown, text: string): boolean;
  toRecords(toolName: string, structured: unknown, text: string, ctx: { target?: string }): EvidenceRecord[];
}
```

- `reaEvidenceAdapter` is implemented against **P0 fixtures** (mapping REA's evidence/limitations/unknown concepts to `observed|inferred|unknown`). Unmappable fields are preserved in `rawArtifactId` and shown through the generic JSON tree.
- `genericAdapter` (always last): wraps any result as one `EvidenceRecord{status:'observed'}` **only if the tool is classified as producing observations**; otherwise returns `[]`. It never fabricates `inferred`/`unknown`.
- Adapters are pure, total functions: they must not throw (wrap → `[]` + `notice`), must not mutate input, and have property tests on fixture permutations.
- **Integrity rule:** the raw tool result is always retained in full in the artifact store regardless of what the model saw.

### 3.8 Snapshots (S)

If `engine.rea.autoSnapshot` and the called tool's input schema has a `snapshot_path` property and the call lacks it and a single target is identified → inject `<project>/.reengine/snapshots/<sha256(targetPath+provider)>.json`. Injection is logged as a notice and visible in the tool card. If the schema lacks the property, do nothing.

### 3.9 Versioning and drift control

- `rea-agents` pinned exactly in `package.json`; `src/engine/contract.ts` exports `{ pinnedVersion, minVersion }`.
- `npm run contract:rea` starts the pinned REA, captures initialize/tools/prompts/resources + CLI JSON outputs, and **diffs against committed fixtures** (`test/fixtures/rea/<version>/`). CI runs it nightly and on any dependency PR (Renovate/Dependabot). Diffs fail the build until fixtures, policy table and adapters are reviewed and updated together.

### 3.10 Degradation matrix

| Situation | Behavior |
|---|---|
| REA not resolvable | App runs; chip `REA ✕`; model told engine unavailable; `engine doctor` explains |
| REA ready, no native provider | JS/.NET/web static analysis still available; native tools return REA's own provider error, shown verbatim + remedy |
| REA crashes mid-call | Result `MCP_CONNECTION_LOST`; auto-restart; model sees the error and may retry once |
| Provider startup slow (Ghidra import) | Progress shown; timeouts extended per `REA_*_STARTUP_TIMEOUT_MS`; user hint to raise |
