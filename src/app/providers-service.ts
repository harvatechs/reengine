import type { ModelInfo } from '../core/contracts.js';
import { loadConfig, resolveSecret, writeConfigEdit } from '../config/index.js';
import { resolveRuntimePaths } from '../platform/index.js';
import {
  PROVIDER_PRESETS,
  createProvider,
  getPreset,
  splitModelRef,
  type ProviderPreset,
} from '../providers/index.js';
import { AppError, ConfigError, SecretRedactor } from '../util/index.js';

export function listProviderPresets(): readonly ProviderPreset[] {
  return PROVIDER_PRESETS;
}

export function listConfiguredProviders(): Array<{ id: string; type: string; endpoint: string }> {
  const { config } = loadConfig();
  return Object.entries(config.providers).map(([id, p]) => ({
    id,
    type: p.type,
    endpoint: p.baseUrl ?? p.preset ?? '-',
  }));
}

function buildProviderEntry(
  type: 'openai-compatible' | 'anthropic' | 'gemini',
  preset: ProviderPreset | undefined,
  opts: { baseUrl?: string; keyRef?: string },
): Record<string, unknown> {
  const baseUrl = opts.baseUrl ?? preset?.baseUrl;
  const authKey = opts.keyRef ?? (preset?.authEnvVar ? `env:${preset.authEnvVar}` : undefined);
  return {
    type,
    ...(preset ? { preset: preset.id } : {}),
    ...(baseUrl ? { baseUrl } : {}),
    auth: {
      type: preset?.authType ?? 'bearer',
      ...(preset?.authHeader ? { header: preset.authHeader } : {}),
      ...(authKey ? { key: authKey } : {}),
    },
  };
}

export function addConfiguredProvider(
  id: string,
  opts: { preset?: string; type?: string; baseUrl?: string; keyRef?: string },
): string {
  const preset = opts.preset ? getPreset(opts.preset) : getPreset(id);
  const type = opts.type ?? preset?.type;
  if (type !== 'openai-compatible' && type !== 'anthropic' && type !== 'gemini') {
    throw new ConfigError(
      'CONFIG_INVALID',
      'Specify --preset <id> or --type <openai-compatible|anthropic|gemini>.',
    );
  }
  const entry = buildProviderEntry(type, preset, opts);
  const paths = resolveRuntimePaths();
  writeConfigEdit(paths.configFile, ['providers', id], entry);
  loadConfig();
  return paths.configFile;
}

export function removeConfiguredProvider(id: string): string {
  const paths = resolveRuntimePaths();
  writeConfigEdit(paths.configFile, ['providers', id], undefined);
  return paths.configFile;
}

export async function probeProviderModels(providerId?: string): Promise<{
  providerId: string;
  providerType: string;
  models: ModelInfo[];
}> {
  const { config } = loadConfig();
  let target = providerId;
  if (!target && config.model.default) {
    target = splitModelRef(config.model.default).providerId;
  }
  if (!target) {
    target = Object.keys(config.providers)[0];
  }
  if (!target) {
    throw new AppError('CONFIG_INVALID', 'No provider specified or configured.');
  }

  const cfg = config.providers[target];
  if (!cfg) {
    throw new ConfigError('PROVIDER_NOT_FOUND', `Provider "${target}" is not configured.`);
  }
  const redactor = new SecretRedactor();
  let resolvedKey: string | undefined;
  if (cfg.auth.key) {
    resolvedKey = await resolveSecret(cfg.auth.key, { sourceScope: 'user', redactor });
  }
  const provider = createProvider({
    id: target,
    type: cfg.type,
    ...(cfg.preset ? { preset: cfg.preset } : {}),
    ...(cfg.baseUrl ? { baseUrl: cfg.baseUrl } : {}),
    auth: {
      type: cfg.auth.type,
      ...(cfg.auth.header ? { header: cfg.auth.header } : {}),
      ...(resolvedKey ? { key: resolvedKey } : {}),
    },
    headers: cfg.headers,
    queryParams: cfg.queryParams,
    ...(cfg.compat ? { compat: cfg.compat } : {}),
    timeouts: cfg.timeouts,
    models: cfg.models,
  });
  const models = await provider.listModels(new AbortController().signal);
  return { providerId: target, providerType: provider.type, models };
}
