# Technical Specifications — ReEngine CLI

## 1. System Architecture & Data Flow

ReEngine enforces a **strict unidirectional, event-driven layered architecture** (mirroring Gemini CLI's decoupling of core engine from Ink UI):

```text
┌────────────────────────────────────────────────────────────────────────────┐
│                        @reengine/cli (Entry & Flags)                       │
│         Interactive TUI Mode (@reengine/ui)  │  Headless Runner Mode       │
└───────────────────────────────┬──────────────┴──────────────┬──────────────┘
                                │ Subscribes to EventBus      │ Dispatches Commands
                                ▼                             ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                           @reengine/core (Kernel)                          │
│  ┌──────────────┐  ┌──────────────────┐  ┌──────────────┐  ┌────────────┐  │
│  │ AgentLoop    │  │ PermissionEngine │  │ ContextMgr & │  │ Session &  │  │
│  │ StateMachine │  │ (Policy/Sandbox) │  │ Compactor    │  │ AuditStore │  │
│  └──────┬───────┘  └────────┬─────────┘  └──────┬───────┘  └────────────┘  │
└─────────┼───────────────────┼───────────────────┼──────────────────────────┘
          │                   │                   │
          ▼                   ▼                   ▼
┌──────────────────────────┐  ┌──────────────────────────────────────────────┐
│   @reengine/providers    │  │              @reengine/mcp-rea               │
│  • ProviderRegistry      │  │  • McpSupervisor (stdio + Streamable HTTP)   │
│  • ModelRouter/Fallback  │  │  • Built-in REA Bootstrap (rea-agents)       │
│  • Stream Normalizer     │  │  • External MCP Multiplexer (Fiddler, etc.)  │
│  • Token & Cost Tracker  │  │  • Artifact Spillover & EvidenceStore        │
└──────────────────────────┘  └──────────────────────┬───────────────────────┘
                                                     │ JSON-RPC 2.0 over stdio/HTTP
                                                     ▼
                              ┌──────────────────────────────────────────────┐
                              │         REA MCP Server (morluto/rea)         │
                              │  Native: Ghidra | Hopper | IDA | Kuna | GDB  │
                              │  Apps:   JS/ASAR | Android/JADX | Firmware   │
                              │  Runtime: Frida | Playwright | CDP | Desktop │
                              └──────────────────────────────────────────────┘
```

## 2. Core Event Bus & Agent State Machine (`@reengine/core`)

No UI component may call an LLM or MCP client directly. All state flows through a typed `AgentEventBus`.

```typescript
// packages/core/src/events/types.ts
export type AgentPhase =
  | 'idle'
  | 'planning'
  | 'streaming_text'
  | 'streaming_reasoning'
  | 'awaiting_permission'
  | 'executing_tools'
  | 'compacting_context'
  | 'error'
  | 'aborted';

export type AgentEvent =
  | { type: 'phase:changed'; phase: AgentPhase; timestamp: number }
  | { type: 'turn:started'; turnId: string; userPrompt: string }
  | { type: 'text:delta'; turnId: string; chunk: string }
  | { type: 'reasoning:delta'; turnId: string; chunk: string }
  | { type: 'tool:proposed'; callId: string; serverId: string; toolName: string; engineTag: string; args: Record<string, unknown>; riskLevel: 'read' | 'dynamic' | 'write' }
  | { type: 'tool:permission_required'; callId: string; summary: string; riskLevel: 'dynamic' | 'write' }
  | { type: 'tool:started'; callId: string; startedAt: number }
  | { type: 'tool:progress'; callId: string; message: string; percent?: number }
  | { type: 'tool:completed'; callId: string; durationMs: number; summary: string; artifactPath?: string; evidenceCount: number; ok: boolean; errorCode?: string }
  | { type: 'evidence:updated'; totalItems: number; coveragePercent?: number; latestArtifactId: string }
  | { type: 'mcp:status'; serverId: string; state: 'starting' | 'ready' | 'degraded' | 'restarting' | 'offline'; toolCount: number; detectedEngines: string[]; detail?: string }
  | { type: 'usage:updated'; promptTokens: number; completionTokens: number; cachedTokens: number; estimatedCostUsd: number | null; contextFillRatio: number; tokensPerSec?: number }
  | { type: 'turn:completed'; turnId: string; stopReason: 'end_turn' | 'max_steps' | 'aborted' | 'error' }
  | { type: 'system:notice'; level: 'info' | 'warn' | 'error'; code: string; message: string };
```

### Agent Turn Loop Specification

1. Receive user prompt → resolve `@file` / `@artifact` / `@evidence` references safely.
2. Check context budget: if `estimatedTokens / modelContextWindow` is greater than `0.82`, invoke `ContextCompactor` (summarizes older tool outputs into structured evidence digests while preserving system prompt, active target metadata, and the last 4 turns verbatim).
3. Stream request to `ModelRouter.stream(messages, normalizedTools, abortSignal)`.
4. Collect assistant text/reasoning deltas and emit `text:delta` / `reasoning:delta`.
5. If tool calls are emitted:
   * Classify risk level (`read` | `dynamic` | `write`) via `PermissionEngine`.
   * For calls requiring approval, transition to `awaiting_permission` and await Promise resolved by TUI/headless policy.
   * Execute approved independent read-only tool calls concurrently (bounded concurrency = `4`); execute stateful/dynamic calls (`frida`, `gdb`, `playwright`) sequentially to avoid session locks.
   * Pass raw MCP result through `ArtifactSpillover`: if larger than `maxInlineChars`, write full JSON to `.reengine/artifacts/`, extract REA `evidence` records into `EvidenceStore`, and return a bounded structured summary + `artifact_id` to the LLM.
   * Increment `stepCount` (hard ceiling: `config.agent.maxStepsPerTurn`, default `25`, user-extensible). Loop back to step 2.
6. Persist completed turn to JSONL session store and emit `turn:completed`.

## 3. Universal Provider & Router Layer (`@reengine/providers`)

Built cleanly over standardized streaming contracts (implementing adapters via `@ai-sdk/*` or lightweight zero-bloat native Fetch SSE clients so binary bundle size stays minimal and custom routers never break on SDK version skew):

```typescript
// packages/providers/src/types.ts
export type ProviderKind =
  | 'anthropic'
  | 'openai'
  | 'google'
  | 'openrouter'
  | 'ollama'
  | 'llamacpp'
  | 'litellm'
  | 'deepseek'
  | 'groq'
  | 'openai-compatible'
  | 'anthropic-compatible';

export interface ProviderProfile {
  id: string;
  kind: ProviderKind;
  baseUrl?: string;
  apiKeyEnv?: string;           // Preferred: env var name (e.g. "OPENROUTER_API_KEY")
  apiKeyRef?: string;           // Encrypted local keychain / secure file reference
  headers?: Record<string, string>;
  defaultModel: string;
  fastModel?: string;
  contextWindowOverride?: number;
  supportsToolCalls?: boolean;
  supportsReasoning?: boolean;
  timeoutMs: number;            // Default: 120_000
}

export interface NormalizedToolDefinition {
  name: string;                 // Namespaced: e.g. "rea__analyze_javascript_application"
  description: string;
  inputSchema: Record<string, unknown>; // Strict JSON Schema Draft-07 sanitized for Gemini/OpenAI/Anthropic quirks
}
```

### Critical Cross-Provider Schema Sanitizer (`schema-normalizer.ts`)

Different LLM providers reject valid MCP JSON Schemas for distinct reasons. `@reengine/providers` MUST normalize every MCP tool schema before transmission:

* **Google Gemini:** Strip unsupported keywords (`$schema`, `additionalProperties` where rejected, `const` converted to single-element `enum`), flatten unsupported `oneOf`/`anyOf` nullables cleanly.
* **OpenAI / OpenRouter:** Ensure `type: "object"` has explicit `properties: {}` even for zero-arg tools; enforce tool name regex `^[a-zA-Z0-9_-]{1,64}$` using reversible alias map (`serverId__toolName` → hash suffix if length exceeds 64).
* **Anthropic:** Map tool results strictly to `tool_result` blocks matching exact `tool_use_id`; support `cache_control: { type: "ephemeral" }` on system prompt + tool definitions to slash reverse-engineering token costs by 60–80%.
* **Local Models (Ollama / `llama-server`):** Auto-query `/api/show` or `/v1/models` to detect context window; enforce smaller inline artifact cap (`6,000` chars) automatically when `contextWindow` is less than `32,768`.

## 4. Built-in REA MCP Supervisor (`@reengine/mcp-rea`)

Uses `@modelcontextprotocol/sdk` supporting both `StdioClientTransport` (default for built-in REA) and `StreamableHTTPClientTransport` (for remote or network MCP servers).

### Built-in REA Resolution Order (`rea-bootstrap.ts`)

1. Check `config.mcp.rea.commandOverride` (for developers pointing to a local clone of `morluto/rea`).
2. Check local bundled/installed `rea-agents` binary in ReEngine's managed tool cache (`~/.reengine/engines/rea/node_modules/.bin/rea-agents`).
3. Check globally installed `rea` / `rea-agents` in system `PATH`.
4. If absent, prompt once (or auto-install in managed cache via `npm install --prefix ~/.reengine/engines/rea rea-agents@latest`) — **never** pollute the user's global Node installation or mutate the target reverse-engineering workspace.

### Engine Auto-Discovery & Badge Mapping

`rea-bootstrap.ts` probes read-only availability (via `which` / `where` + standard OS install directories + env vars like `GHIDRA_INSTALL_DIR`, `IDA_PATH`, `JADX_HOME`) to populate live workspace badges:

* **Static Native:** `Ghidra`, `Hopper`, `IDA`, `Kuna`, `Cutter`
* **App & Firmware:** `JS/Electron/ASAR` (always ready, zero external deps), `Android/JADX`, `Devicetree/Firmware`
* **Dynamic & Runtime:** `Frida`, `GDB`, `Playwright/CDP`

### Stdout/Stderr Isolation Rule

When spawning REA over `stdio`:

* `stdout` is exclusively reserved for MCP JSON-RPC frames.
* `stderr` is piped into a bounded ring buffer (`500` lines) per server and routed to `~/.reengine/logs/mcp-rea.log`, with live tail lines surfaced cleanly inside the TUI's `ToolCallCard` progress line—**never** written directly to the terminal TTY.

## 5. TUI Architecture & Customization Engine (`@reengine/ui`)

Built with **React 19 + Ink 5+** (leveraging Yoga Flexbox layout, pure TypeScript, zero native C++ bindings issues) following a strict `screens/` → `parts/` → `common/` hierarchy.

### Screen Layout Geometry

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ REENGINE v1.0  target: ./app.asar  [REA: READY] [JS][GHIDRA]  claude-4  18%  │ ← HeaderBar (1 line)
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  you  Analyze how license validation works in this Electron app and trace    │
│       the IPC handlers with file/line evidence.                              │
│                                                                              │
│  ● rea::analyze_javascript_application  [JS/ASAR]              1.4s ✓ (42ev) │ ← ToolCallCard (collapsed)
│    └─ 18 modules, 6 Electron IPC boundaries → artifact #a01 (Ctrl+O expand)  │
│                                                                              │
│  reengine                                                                    │
│  License checks execute in `main/ipc/licenseBridge.js:142` via the           │
│  `license:verify` ipcMain channel...                                         │
│                                                                              │
│  ┌─ Evidence Trail (3 verified) ───────────────────────────────────────────┐ │ ← EvidenceBadge
│  │ [E1] main/ipc/licenseBridge.js:142-168  (ipcMain.handle)                │ │
│  │ [E2] renderer/preload.js:29             (contextBridge.exposeInMain...) │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│ > @main/ipc/  _                                                              │ ← PromptInput
├──────────────────────────────────────────────────────────────────────────────┤
│ Mode: Read-Auto │ Model: openrouter/anthropic/claude │ $0.014 │ Ctrl+K Menu  │ ← StatusRail (1 line)
└──────────────────────────────────────────────────────────────────────────────┘
```

### Configuration & Customization Schema (`packages/core/src/config/schema.ts`)

```typescript
import { z } from 'zod';

const HexColorSchema = z.string().regex(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/, 'Must be valid HEX color');

export const ThemePaletteSchema = z.object({
  background: HexColorSchema.optional(), // Undefined = inherit terminal transparency/bg
  surface: HexColorSchema,
  textPrimary: HexColorSchema,
  textSecondary: HexColorSchema,
  textMuted: HexColorSchema,
  accent: HexColorSchema,
  accentMuted: HexColorSchema,
  border: HexColorSchema,
  borderFocused: HexColorSchema,
  success: HexColorSchema,
  warning: HexColorSchema,
  error: HexColorSchema,
  info: HexColorSchema,
  engineBadge: HexColorSchema,
  codeKeyword: HexColorSchema,
  codeString: HexColorSchema,
  codeAddress: HexColorSchema,
  diffAdd: HexColorSchema,
  diffRemove: HexColorSchema,
});

export const UiCustomizationSchema = z.object({
  themeName: z.string().default('obsidian-minimal'),
  customPalette: ThemePaletteSchema.partial().optional(),
  density: z.enum(['compact', 'balanced', 'spacious']).default('balanced'),
  textScale: z.enum(['compact', 'standard', 'prominent']).default('standard'),
  borderStyle: z.enum(['none', 'single', 'round', 'bold', 'double']).default('round'),
  iconPack: z.enum(['nerd', 'unicode', 'ascii']).default('unicode'),
  maxContentWidth: z.union([z.literal('full'), z.number().int().min(72).max(200)]).default(120),
  collapseToolsByDefault: z.boolean().default(true),
  showReasoningByDefault: z.boolean().default(false),
  showTokenCost: z.boolean().default(true),
  showTimestamps: z.boolean().default(false),
  animations: z.boolean().default(true),
  terminalFontProfile: z.object({
    fontFamily: z.string().default('JetBrains Mono'),
    fontSizePt: z.number().min(8).max(32).default(13),
    lineHeight: z.number().min(1.0).max(2.0).default(1.25),
    applyLiveOscIfSupported: z.boolean().default(false),
  }).default({}),
});
```

## 6. Packaging & Production Deployment

* **Distribution Channels:**
  1. `npm install -g @reengine/cli` (or `npx @reengine/cli`) — primary zero-friction install using bundled ESM output (`tsup` / `esbuild` single-bundle per workspace package with externalized optional native deps).
  2. Standalone executables via `bun build --compile` (Linux x64/arm64, macOS arm64/x64, Windows x64) published automatically on GitHub Releases with SHA-256 checksums.
* **CI/CD Pipeline (`.github/workflows/release.yml`):** Typecheck (`tsc --noEmit`) → Lint (`biome check`) → Unit + Integration + TUI tests (`vitest run`) → Build → Smoke test `reengine doctor --json` and `reengine run` against mock MCP → Publish npm + GitHub Release artifacts.
