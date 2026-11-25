import { describe, expect, it } from 'vitest';
import { ConfigSchema } from '../../../src/config/index.js';
import { PROVIDER_PRESETS, getPreset } from '../../../src/providers/index.js';

describe('src/providers/presets (P2-06)', () => {
  it('includes all 12 required presets and validates every preset against ConfigSchema', () => {
    const required = [
      'openai',
      'anthropic',
      'gemini',
      'openrouter',
      'ollama',
      'lm-studio',
      'litellm',
      'groq',
      'together',
      'deepseek',
      'mistral',
      'azure-openai',
    ];
    for (const id of required) {
      expect(getPreset(id)).toBeDefined();
    }

    for (const preset of PROVIDER_PRESETS) {
      const baseUrl =
        preset.id === 'azure-openai'
          ? 'https://myres.openai.azure.com/openai/deployments/gpt4'
          : preset.baseUrl;
      const parsed = ConfigSchema.safeParse({
        version: 1,
        providers: {
          [preset.id]: {
            type: preset.type,
            preset: preset.id,
            baseUrl,
            auth: {
              type: preset.authType,
              ...(preset.authHeader ? { header: preset.authHeader } : {}),
              ...(preset.authEnvVar ? { key: `env:${preset.authEnvVar}` } : {}),
            },
            queryParams: preset.queryParams ?? {},
          },
        },
      });
      expect(parsed.success, `Preset ${preset.id} failed Zod validation`).toBe(true);
    }
  });
});
