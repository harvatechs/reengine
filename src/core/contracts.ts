export type JsonSchema = Record<string, unknown>;
export type ReasoningLevel = 'off' | 'low' | 'medium' | 'high';
export type Role = 'user' | 'assistant' | 'tool';

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  reasoningTokens?: number;
}

export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'reasoning'; text: string; providerId: string; signature?: string }
  | { type: 'tool_call'; id: string; name: string; args: unknown }
  | {
      type: 'tool_result';
      callId: string;
      name: string;
      isError: boolean;
      modelView: string; // what the model sees (possibly truncated)
      artifactId?: string; // full raw output, if spilled
      evidenceIds?: string[];
    };

export interface Message {
  id: string;
  role: Role;
  parts: ContentPart[];
  ts: number; // epoch ms
  meta?: { providerId?: string; modelId?: string; usage?: Usage; synthetic?: boolean };
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: JsonSchema;
}

export interface ModelCapabilities {
  contextWindow: number;
  maxOutputTokens: number;
  tools: boolean;
  parallelTools: boolean;
  vision: boolean;
  reasoning: 'none' | 'effort' | 'budget';
  streamUsage: boolean;
}

export interface ModelInfo {
  id: string;
  displayName?: string;
  capabilities?: Partial<ModelCapabilities>;
}

export interface ModelRequest {
  model: string;
  system: string;
  messages: Message[];
  tools: ToolDefinition[];
  maxOutputTokens: number;
  temperature?: number;
  reasoning?: ReasoningLevel;
  cache?: { system: boolean; tools: boolean; prefixMessages: number };
}

export type ModelStreamEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'reasoning_delta'; text: string; signature?: string }
  | { type: 'tool_call_start'; index: number; id: string; name: string }
  | { type: 'tool_call_delta'; index: number; argsFragment: string }
  | { type: 'tool_call_end'; index: number }
  | { type: 'usage'; usage: Usage }
  | { type: 'finish'; reason: 'stop' | 'tool_calls' | 'length' | 'content_filter' };

export type ProviderErrorKind =
  | 'auth'
  | 'rate_limit'
  | 'overloaded'
  | 'context_length'
  | 'invalid_request'
  | 'network'
  | 'timeout'
  | 'aborted'
  | 'unsupported'
  | 'unknown';

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly kind: ProviderErrorKind,
    readonly retryable: boolean,
    readonly status?: number,
    readonly retryAfterMs?: number,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

export interface ModelProvider {
  readonly id: string;
  readonly type: 'openai-compatible' | 'anthropic' | 'gemini';
  capabilities(modelId: string): ModelCapabilities;
  listModels(signal: AbortSignal): Promise<ModelInfo[]>;
  stream(req: ModelRequest, signal: AbortSignal): AsyncIterable<ModelStreamEvent>;
}

// ---- Tools ----
export type ToolRisk = 'read' | 'write' | 'exec' | 'network' | 'mcp';

export interface ToolOutput {
  isError: boolean;
  content: string; // human/model-readable full text
  structured?: unknown; // raw structured payload (MCP structuredContent etc.)
  evidence?: EvidenceRecord[]; // normalized by engine adapters; may be empty
}

export interface ToolContext {
  cwd: string;
  workspaceRoot: string;
  signal: AbortSignal;
  reportProgress(p: { message?: string; progress?: number; total?: number }): void;
}

export interface Tool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: JsonSchema;
  readonly risk: ToolRisk;
  readonly readOnly: boolean;
  readonly destructive: boolean;
  readonly openWorld: boolean; // touches/reads untrusted external content
  readonly pathArgs: readonly string[]; // top-level property names holding filesystem paths
  readonly source: { kind: 'builtin' } | { kind: 'mcp'; server: string; originalName: string };
  describe(input: unknown): string; // one-line human summary for prompts/cards
  execute(input: unknown, ctx: ToolContext): Promise<ToolOutput>;
}

// ---- Evidence (normalized view-model; raw REA payload is always kept in artifacts) ----
export type EvidenceStatus = 'observed' | 'inferred' | 'unknown';
export interface EvidenceRecord {
  id: string; // stable within session
  status: EvidenceStatus;
  title: string;
  summary: string;
  source?: { tool: string; target?: string; location?: string };
  limitations?: string[];
  rawArtifactId?: string;
}

// ---- Permissions ----
export type PermissionMode = 'plan' | 'default' | 'acceptEdits' | 'bypass';
export interface PermissionDecision {
  behavior: 'allow' | 'deny' | 'ask';
  reason: string;
  ruleId?: string;
}
export type PermissionAnswer =
  | { kind: 'allow_once' }
  | { kind: 'allow_session' }
  | { kind: 'allow_project_rule' }
  | { kind: 'deny' }
  | { kind: 'deny_with_feedback'; feedback: string };

export interface PermissionRequest {
  callId: string;
  tool: string;
  summary: string;
  risk: ToolRisk;
  tainted: boolean;
  preview?:
    | { kind: 'diff'; unified: string }
    | { kind: 'command'; command: string; cwd: string }
    | { kind: 'json'; value: unknown };
}

// ---- Agent events (the ONLY channel from core to any renderer) ----
export type AgentEvent =
  | { type: 'turn_start'; turnId: string }
  | { type: 'assistant_text_delta'; text: string }
  | { type: 'reasoning_delta'; text: string }
  | { type: 'assistant_message'; message: Message }
  | { type: 'tool_pending'; callId: string; tool: string; summary: string }
  | { type: 'permission_request'; request: PermissionRequest }
  | { type: 'tool_progress'; callId: string; message?: string; progress?: number; total?: number }
  | {
      type: 'tool_result';
      callId: string;
      tool: string;
      isError: boolean;
      durationMs: number;
      modelView: string;
      artifactId?: string;
      evidence: EvidenceRecord[];
    }
  | { type: 'compaction'; beforeTokens: number; afterTokens: number }
  | { type: 'usage'; usage: Usage; contextTokens: number; contextWindow: number }
  | { type: 'notice'; level: 'info' | 'warn'; message: string }
  | { type: 'error'; error: { code: string; message: string; retryable: boolean } }
  | {
      type: 'turn_end';
      turnId: string;
      reason: 'complete' | 'cancelled' | 'max_steps' | 'error' | 'budget';
    };
