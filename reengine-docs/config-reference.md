# config-reference.md

Single source of truth for configuration. The Zod schema in `src/config/schema.ts` MUST match this file; `npm run schema:gen` emits `schemas/config.v1.schema.json`; a test fails if a key exists in one and not the other.

## 1. Files and precedence

Lowest → highest (later overrides earlier; objects deep-merge, arrays **replace**, except `permissions.*` rule arrays which **concatenate** with deny > ask > allow precedence at evaluation time):

1. Built-in defaults
2. User: `<config>/config.jsonc` (or `.json`)
3. Project: `<workspace>/.reengine/config.jsonc` — **subject to trust gate** for `mcpServers`, `engine.rea.command/args/env`, `permissions.allow`, `providers.*.baseUrl/headers`
4. Environment: `REENGINE_*` (see §5)
5. CLI flags

Format: JSONC (comments + trailing commas). Writes via `config set`/UI use `jsonc-parser` edits that **preserve comments and formatting**. `"version": 1` is required in written files; older versions are migrated in memory and rewritten only on explicit save, with a `.bak` copy.

Validation errors are path-precise: `config.providers.openrouter.compat.maxTokensParam: expected "max_tokens" | "max_completion_tokens", received "tokens" (file: …/config.jsonc:14:9)`. Exit code 2.

## 2. Secret references

Any string field documented as `secret` accepts:

| Form | Meaning |
|---|---|
| `env:NAME` | Read environment variable at use time |
| `file:/abs/path` or `file:~/path` | Read file contents (trimmed); warn if world-readable |
| `keychain:<account>` | OS keychain entry under service `reengine-cli` |
| literal string | **Rejected in project config; allowed in user config with a warning** (`SECRET_LITERAL`) |

Resolved values are registered with the log redactor immediately. `config list` prints references, never values.

## 3. Full key reference

### 3.1 Top level

| Key | Type | Default | Notes |
|---|---|---|---|
| `$schema` | string | — | Editor assist |
| `version` | `1` | `1` | |
| `model` | object | — | §3.2 |
| `providers` | record<string, Provider> | `{}` | §3.3 |
| `mcpServers` | record<string, McpServer> | `{}` | §3.4 |
| `engine` | object | — | §3.5 |
| `permissions` | object | — | §3.6 |
| `context` | object | — | §3.7 |
| `tools` | object | — | §3.8 |
| `session` | object | — | §3.9 |
| `ui` | object | — | §3.10 |
| `updates` | `{check: boolean}` | `{check:true}` | npm registry version check (notify-only) |
| `logging` | object | — | `{level:'error'\|'warn'\|'info'\|'debug'\|'trace', retentionDays:number}` default `info`, 14 |

### 3.2 `model`

| Key | Type | Default |
|---|---|---|
| `default` | string `provider/model` | none → setup wizard |
| `roles.compaction` | string | = default |
| `roles.title` | string | = default |
| `maxOutputTokens` | int | 16000 (capped by model capability) |
| `temperature` | number 0–2 | provider default |
| `reasoning` | `off\|low\|medium\|high` | `off` |
| `maxSteps` | int | 60 |

### 3.3 `providers.<id>`

| Key | Type | Default | Notes |
|---|---|---|---|
| `type` | `openai-compatible\|anthropic\|gemini` | required | |
| `preset` | string | — | Fill defaults from a preset; explicit keys override |
| `baseUrl` | URL | preset | Must be `https:` or loopback `http:`; other `http:` rejected unless `allowInsecure:true` |
| `auth.type` | `bearer\|header\|none` | `bearer` | |
| `auth.header` | string | `Authorization`/vendor | For `header` type, e.g. `api-key` |
| `auth.key` | secret | — | |
| `headers` | record<string,string\|secret> | `{}` | |
| `queryParams` | record<string,string> | `{}` | e.g. Azure `api-version` |
| `compat` | object | per preset | See integrations-spec §1.3 |
| `timeouts` | `{connectMs,idleMs,totalMs}` | 30000/60000/900000 | |
| `models.<modelId>` | `{contextWindow?, maxOutputTokens?, tools?, parallelTools?, vision?, reasoning?, pricing?}` | — | Capability overrides |
| `models.<modelId>.pricing` | `{inputPerMTok, outputPerMTok, cacheReadPerMTok?, cacheWritePerMTok?}` USD | — | Enables cost display |
| `disabled` | boolean | false | |

### 3.4 `mcpServers.<name>`

| Key | Type | Default |
|---|---|---|
| `transport` | `stdio\|http\|sse` | required |
| `command`,`args`,`cwd` | stdio | — |
| `env` | record<string,string\|secret> | `{}` |
| `url`,`headers` | http/sse | — |
| `enabled` | boolean | true |
| `requestTimeoutMs` | int | 120000 |
| `trust` | `ask\|readOnlyAuto\|trusted` | `ask` — `readOnlyAuto`: tools with `readOnlyHint:true` auto-allowed; `trusted`: all tools skip *ask* (taint guard still applies) |
| `toolAllow`,`toolDeny` | string[] globs | — |

The name `rea` is reserved for the built-in engine; user entries named `rea` are rejected.

### 3.5 `engine.rea`

| Key | Type | Default |
|---|---|---|
| `enabled` | boolean | true |
| `command`,`args` | string, string[] | unset (use resolver) |
| `allowNpx` | boolean | false |
| `provider` | `auto\|ghidra\|hopper\|ida\|jadx\|kuna\|<id>` | `auto` → sets `REA_ANALYSIS_PROVIDER` unless `auto` |
| `env` | record<string,string\|secret> | `{}` — only `REA_*` keys accepted |
| `startupTimeoutMs` | int | 30000 |
| `requestTimeoutMs` | int | 600000 |
| `schemaProfile` | `compact\|full` | `compact` → `REA_MCP_INPUT_SCHEMA_PROFILE`/`OUTPUT` |
| `autoSnapshot` | boolean | true |
| `restartLimit` | int | 3 |

### 3.6 `permissions`

| Key | Type | Default |
|---|---|---|
| `mode` | `plan\|default\|acceptEdits\|bypass` | `default` (`bypass` ignored from project config) |
| `allow`,`ask`,`deny` | string[] rules | `[]` |
| `taintGuard` | boolean | true |
| `additionalDirectories` | string[] | `[]` |

Rule grammar: `ToolName` or `ToolName(pattern)`; `*` and `**` globs; examples: `read_file(**)`, `shell(git status)`, `shell(npm run *)`, `mcp__rea__*`, `edit_file(./src/**)`. Evaluation order: deny → ask → allow → mode default.

### 3.7 `context`

`compactAt` 0.8 · `keepRecentToolResults` 8 · `keepRecentMessages` 6 · `memoryFiles` `['REENGINE.md','AGENTS.md']` · `maxMemoryBytes` 65536.

### 3.8 `tools`

`spillThresholdTokens` 6000 · `shell.timeoutMs` 120000 · `shell.maxOutputBytes` 1048576 · `shell.shell` (auto: `$SHELL`/`bash`, Windows `pwsh`→`powershell`→`cmd`) · `shell.envAllow` string[] (extra env passthrough) · `read.maxBytes` 2097152 · `grep.maxMatches` 500.

### 3.9 `session`

`retentionDays` 90 · `autoTitle` true · `storeConfigSnapshot` true.

### 3.10 `ui`

| Key | Type | Default |
|---|---|---|
| `theme` | string (built-in or file name) | `reengine-dark` |
| `density` | `compact\|comfortable\|spacious` | `comfortable` |
| `borders` | `rounded\|single\|double\|bold\|ascii\|none` | `rounded` |
| `glyphs` | `unicode\|ascii\|nerd` | auto-detected, default `unicode` |
| `spinner` | `dots\|line\|arc\|pulse\|none` | `dots` |
| `markdown` | boolean | true |
| `wrap` | `terminal` \| int (columns) | `terminal` |
| `maxContentWidth` | int \| `null` | 120 |
| `showReasoning` | `hidden\|collapsed\|full` | `collapsed` |
| `toolOutput` | `hidden\|summary\|preview\|full` | `preview` |
| `toolOutputPreviewLines` | int | 8 |
| `timestamps` | boolean | false |
| `showTokenUsage` | boolean | true |
| `showCost` | boolean | true (only if pricing set) |
| `statusBar` | boolean | true |
| `inspector.defaultOpen` | boolean | false |
| `bell` | boolean | false (bell on permission request / turn end when true) |
| `terminalTitle` | boolean | true |
| `plain` | boolean | false (accessibility/plain mode) |
| `colorOverrides` | partial theme `colors` | `{}` — tweak any token without a new theme file |
| `terminalProfile.fontFamily` | string | — *(export only)* |
| `terminalProfile.fontSize` | number | — *(export only)* |
| `terminalProfile.lineHeight` | number | — *(export only)* |
| `terminalProfile.ligatures` | boolean | — *(export only)* |

## 4. Complete example (user config)

```jsonc
{
  "$schema": "./node_modules/reengine-cli/schemas/config.v1.schema.json",
  "version": 1,
  "model": {
    "default": "anthropic/claude-sonnet-5-5",
    "roles": { "compaction": "openrouter/google/gemini-2.5-flash" },
    "reasoning": "medium"
  },
  "providers": {
    "anthropic": { "type": "anthropic", "preset": "anthropic", "auth": { "key": "env:ANTHROPIC_API_KEY" } },
    "openrouter": { "type": "openai-compatible", "preset": "openrouter", "auth": { "key": "keychain:openrouter" } },
    "ollama": {
      "type": "openai-compatible", "preset": "ollama",
      "models": { "qwen2.5-coder:32b": { "contextWindow": 32768, "parallelTools": false } }
    }
  },
  "engine": { "rea": { "provider": "ghidra", "env": { "REA_GHIDRA_STARTUP_TIMEOUT_MS": "300000" } } },
  "permissions": { "mode": "default", "allow": ["read_file(**)", "grep", "glob", "mcp__rea__*"] },
  "ui": {
    "theme": "reengine-dark", "density": "compact", "borders": "single", "glyphs": "unicode",
    "colorOverrides": { "brand": { "accent": "#FF8800" } },
    "terminalProfile": { "fontFamily": "JetBrains Mono", "fontSize": 13, "lineHeight": 1.2, "ligatures": true }
  }
}
```

> Model IDs above are illustrative; real model lists come from provider discovery.
> `mcp__rea__*` in `allow` is only honored for tools the REA policy table classifies as read-only; classified `exec`/`network` tools still ask (security §4.3).

## 5. Environment variables

| Variable | Effect |
|---|---|
| `REENGINE_HOME` | Single root for all dirs (tests/containers) |
| `REENGINE_CONFIG` | Explicit config file path |
| `REENGINE_MODEL` | Overrides `model.default` |
| `REENGINE_THEME` | Overrides `ui.theme` |
| `REENGINE_PERMISSION_MODE` | `plan\|default\|acceptEdits` (`bypass` requires flag) |
| `REENGINE_LOG_LEVEL` | Logging level |
| `REENGINE_NO_UPDATE_CHECK=1` | Disable version check |
| `REENGINE_ALLOW_BYPASS=1` | Required **in addition to** `--yolo` to enable bypass mode |
| `NO_COLOR`, `FORCE_COLOR` | Standard color control |
| Provider keys | Whatever your `env:` refs name (presets default to `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`, `GROQ_API_KEY`, `TOGETHER_API_KEY`, `DEEPSEEK_API_KEY`, `MISTRAL_API_KEY`) |

## 6. Other user files

- `keybindings.json`: `{ "version":1, "bindings": { "<action>": ["ctrl+k", …] } }` — actions in `ui-design-spec.md` §8.
- `themes/<name>.json`: schema in `ui-design-spec.md` §6; `$schema` emitted to `schemas/theme.v1.schema.json`.
- `trust.json` (state dir): `{ "folders": { "<realpath>": { "trustedAt": ISO, "configHash": sha256 } } }`. If a project's trust-gated config hash changes, trust is re-requested.
- `REENGINE.md`: free-form Markdown memory. Load order: user (`<config>/REENGINE.md`) → each ancestor directory from git root to cwd. Max total 64 KB, truncated with a notice.
