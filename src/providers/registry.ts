import type { ModelProvider } from '../core/contracts.js';
import { AppError } from '../util/index.js';
import { AnthropicProvider } from './anthropic.js';
import { GeminiProvider } from './gemini.js';
import { HttpClient } from './http.js';
import { OpenAiCompatibleProvider } from './openai-compatible.js';
import { getPreset } from './presets.js';
import type { ProviderConfigInput } from './types.js';

export function splitModelRef(
  modelRef: string,
  defaultProviderId?: string,
): { providerId: string; modelId: string } {
  const slashIdx = modelRef.indexOf('/');
  if (slashIdx > 0) {
    return {
      providerId: modelRef.slice(0, slashIdx),
      modelId: modelRef.slice(slashIdx + 1),
    };
  }
  if (!defaultProviderId) {
    throw new AppError(
      'CONFIG_INVALID',
      `Model reference "${modelRef}" is missing a provider prefix (expected <providerId>/<modelId>).`,
    );
  }
  return { providerId: defaultProviderId, modelId: modelRef };
}

function resolveProviderConfigWithPreset(input: ProviderConfigInput): ProviderConfigInput {
  if (!input.preset) {
    return input;
  }
  const preset = getPreset(input.preset);
  if (!preset) {
    return input;
  }
  return {
    ...input,
    baseUrl: input.baseUrl ?? preset.baseUrl,
    auth: {
      type: input.auth.type,
      header: input.auth.header ?? preset.authHeader,
      key: input.auth.key,
    },
    queryParams: { ...(preset.queryParams ?? {}), ...input.queryParams },
    compat: { ...preset.compat, ...(input.compat ?? {}) },
  };
}

export function createProvider(input: ProviderConfigInput, http?: HttpClient): ModelProvider {
  const resolved = resolveProviderConfigWithPreset(input);
  switch (resolved.type) {
    case 'openai-compatible':
      return new OpenAiCompatibleProvider(resolved, http);
    case 'anthropic':
      return new AnthropicProvider(resolved, http);
    case 'gemini':
      return new GeminiProvider(resolved, http);
  }
}
