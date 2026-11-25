import type { ModelCapabilities } from '../core/contracts.js';

export type ProviderType = 'openai-compatible' | 'anthropic' | 'gemini';

export interface ProviderCompat {
  maxTokensParam?: 'max_tokens' | 'max_completion_tokens' | undefined;
  supportsDeveloperRole?: boolean | undefined;
  supportsReasoningEffort?: boolean | undefined;
  streamUsageInChunks?: boolean | undefined;
  toolCallStreamMode?: 'delta' | 'complete' | undefined;
  systemPromptMode?: 'system' | 'developer' | 'first-user' | undefined;
  extraBody?: Record<string, unknown> | undefined;
}

interface ProviderAuthConfig {
  type: 'bearer' | 'header' | 'none';
  header?: string | undefined;
  key?: string | undefined;
}

interface ProviderModelOverride {
  contextWindow?: number | undefined;
  maxOutputTokens?: number | undefined;
  tools?: boolean | undefined;
  parallelTools?: boolean | undefined;
  vision?: boolean | undefined;
  reasoning?: boolean | undefined;
}

export interface ProviderConfigInput {
  id: string;
  type: ProviderType;
  preset?: string | undefined;
  baseUrl?: string | undefined;
  auth: ProviderAuthConfig;
  headers: Record<string, string>;
  queryParams: Record<string, string>;
  compat?: ProviderCompat | undefined;
  timeouts?:
    | { connectMs?: number | undefined; idleMs?: number | undefined; totalMs?: number | undefined }
    | undefined;
  models?: Record<string, ProviderModelOverride> | undefined;
}

export const DEFAULT_MODEL_CAPABILITIES: ModelCapabilities = {
  contextWindow: 128_000,
  maxOutputTokens: 8_192,
  tools: true,
  parallelTools: true,
  vision: false,
  reasoning: 'none',
  streamUsage: true,
};
