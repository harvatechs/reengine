import type { ProviderCompat, ProviderType } from './types.js';

export interface ProviderPreset {
  id: string;
  label: string;
  type: ProviderType;
  baseUrl: string;
  authType: 'bearer' | 'header' | 'none';
  authHeader?: string;
  authEnvVar?: string;
  queryParams?: Record<string, string>;
  compat: ProviderCompat;
  notes: string;
  keyUrl: string;
}

export const PROVIDER_PRESETS: readonly ProviderPreset[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    type: 'openai-compatible',
    baseUrl: 'https://api.openai.com/v1',
    authType: 'bearer',
    authEnvVar: 'OPENAI_API_KEY',
    compat: {
      maxTokensParam: 'max_completion_tokens',
      supportsDeveloperRole: true,
      supportsReasoningEffort: true,
      streamUsageInChunks: true,
      toolCallStreamMode: 'delta',
      systemPromptMode: 'developer',
    },
    notes: 'Official OpenAI Chat Completions API',
    keyUrl: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    type: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    authType: 'header',
    authHeader: 'x-api-key',
    authEnvVar: 'ANTHROPIC_API_KEY',
    compat: {
      streamUsageInChunks: true,
      toolCallStreamMode: 'delta',
    },
    notes: 'Official Anthropic Messages API with prompt caching & thinking',
    keyUrl: 'https://console.anthropic.com/settings/keys',
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    type: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    authType: 'header',
    authHeader: 'x-goog-api-key',
    authEnvVar: 'GEMINI_API_KEY',
    compat: {
      streamUsageInChunks: true,
      toolCallStreamMode: 'complete',
    },
    notes: 'Google Generative Language API (streamGenerateContent)',
    keyUrl: 'https://aistudio.google.com/app/apikey',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    type: 'openai-compatible',
    baseUrl: 'https://openrouter.ai/api/v1',
    authType: 'bearer',
    authEnvVar: 'OPENROUTER_API_KEY',
    compat: {
      maxTokensParam: 'max_tokens',
      supportsDeveloperRole: false,
      supportsReasoningEffort: true,
      streamUsageInChunks: true,
      toolCallStreamMode: 'delta',
      systemPromptMode: 'system',
    },
    notes: 'Multi-model router supporting OpenAI, Anthropic, Google, and open weights',
    keyUrl: 'https://openrouter.ai/keys',
  },
  {
    id: 'ollama',
    label: 'Ollama (Local)',
    type: 'openai-compatible',
    baseUrl: 'http://127.0.0.1:11434/v1',
    authType: 'none',
    compat: {
      maxTokensParam: 'max_tokens',
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
      streamUsageInChunks: true,
      toolCallStreamMode: 'delta',
      systemPromptMode: 'system',
    },
    notes: 'Local Ollama server (/v1 OpenAI-compatible endpoint)',
    keyUrl: 'https://ollama.com',
  },
  {
    id: 'lm-studio',
    label: 'LM Studio (Local)',
    type: 'openai-compatible',
    baseUrl: 'http://127.0.0.1:1234/v1',
    authType: 'none',
    compat: {
      maxTokensParam: 'max_tokens',
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
      streamUsageInChunks: true,
      toolCallStreamMode: 'delta',
      systemPromptMode: 'system',
    },
    notes: 'Local LM Studio server (/v1 endpoint)',
    keyUrl: 'https://lmstudio.ai',
  },
  {
    id: 'litellm',
    label: 'LiteLLM Proxy',
    type: 'openai-compatible',
    baseUrl: 'http://127.0.0.1:4000/v1',
    authType: 'bearer',
    authEnvVar: 'LITELLM_API_KEY',
    compat: {
      maxTokensParam: 'max_tokens',
      supportsDeveloperRole: false,
      supportsReasoningEffort: true,
      streamUsageInChunks: true,
      toolCallStreamMode: 'delta',
      systemPromptMode: 'system',
    },
    notes: 'LiteLLM gateway proxy',
    keyUrl: 'https://docs.litellm.ai',
  },
  {
    id: 'groq',
    label: 'Groq',
    type: 'openai-compatible',
    baseUrl: 'https://api.groq.com/openai/v1',
    authType: 'bearer',
    authEnvVar: 'GROQ_API_KEY',
    compat: {
      maxTokensParam: 'max_tokens',
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
      streamUsageInChunks: true,
      toolCallStreamMode: 'delta',
      systemPromptMode: 'system',
    },
    notes: 'Groq LPU inference endpoint',
    keyUrl: 'https://console.groq.com/keys',
  },
  {
    id: 'together',
    label: 'Together AI',
    type: 'openai-compatible',
    baseUrl: 'https://api.together.xyz/v1',
    authType: 'bearer',
    authEnvVar: 'TOGETHER_API_KEY',
    compat: {
      maxTokensParam: 'max_tokens',
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
      streamUsageInChunks: true,
      toolCallStreamMode: 'delta',
      systemPromptMode: 'system',
    },
    notes: 'Together AI OpenAI-compatible inference',
    keyUrl: 'https://api.together.xyz/settings/api-keys',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    type: 'openai-compatible',
    baseUrl: 'https://api.deepseek.com/v1',
    authType: 'bearer',
    authEnvVar: 'DEEPSEEK_API_KEY',
    compat: {
      maxTokensParam: 'max_tokens',
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
      streamUsageInChunks: true,
      toolCallStreamMode: 'delta',
      systemPromptMode: 'system',
    },
    notes: 'DeepSeek Chat / Reasoner API',
    keyUrl: 'https://platform.deepseek.com/api_keys',
  },
  {
    id: 'mistral',
    label: 'Mistral AI',
    type: 'openai-compatible',
    baseUrl: 'https://api.mistral.ai/v1',
    authType: 'bearer',
    authEnvVar: 'MISTRAL_API_KEY',
    compat: {
      maxTokensParam: 'max_tokens',
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
      streamUsageInChunks: true,
      toolCallStreamMode: 'delta',
      systemPromptMode: 'system',
    },
    notes: 'Mistral AI API',
    keyUrl: 'https://console.mistral.ai/api-keys',
  },
  {
    id: 'azure-openai',
    label: 'Azure OpenAI (Template)',
    type: 'openai-compatible',
    baseUrl: 'https://<resource>.openai.azure.com/openai/deployments/<deployment>',
    authType: 'header',
    authHeader: 'api-key',
    authEnvVar: 'AZURE_OPENAI_API_KEY',
    queryParams: { 'api-version': '2024-10-21' },
    compat: {
      maxTokensParam: 'max_completion_tokens',
      supportsDeveloperRole: true,
      supportsReasoningEffort: true,
      streamUsageInChunks: true,
      toolCallStreamMode: 'delta',
      systemPromptMode: 'developer',
    },
    notes: 'Replace <resource> and <deployment> in baseUrl',
    keyUrl: 'https://portal.azure.com',
  },
];

export function getPreset(id: string): ProviderPreset | undefined {
  return PROVIDER_PRESETS.find((p) => p.id === id);
}
