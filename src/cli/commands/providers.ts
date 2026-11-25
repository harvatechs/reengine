import type { Command } from 'commander';
import {
  addConfiguredProvider,
  listConfiguredProviders,
  listProviderPresets,
  probeProviderModels,
  removeConfiguredProvider,
} from '../../app/providers-service.js';

export function registerProvidersCommands(program: Command, stdout: NodeJS.WritableStream): void {
  const prv = program.command('providers').description('Manage LLM providers and presets');

  prv
    .command('presets')
    .description('List built-in provider presets')
    .action(() => {
      for (const p of listProviderPresets()) {
        stdout.write(`${p.id.padEnd(14)} ${p.type.padEnd(18)} ${p.baseUrl}\n`);
      }
    });

  prv
    .command('list')
    .description('List configured providers')
    .action(() => {
      const entries = listConfiguredProviders();
      if (entries.length === 0) {
        stdout.write(
          'No providers configured. Run `reengine providers add` or `reengine setup`.\n',
        );
        return;
      }
      for (const p of entries) {
        stdout.write(`${p.id.padEnd(16)} ${p.type.padEnd(18)} ${p.endpoint}\n`);
      }
    });

  prv
    .command('add <id>')
    .description('Add a provider from a preset or custom URL')
    .option('--preset <presetId>', 'Built-in preset ID')
    .option('--type <type>', 'Adapter type (openai-compatible|anthropic|gemini)')
    .option('--base-url <url>', 'Provider base URL')
    .option('--key-ref <secretRef>', 'Secret reference (env:NAME, file:PATH, keychain:ACC)')
    .action(
      (id: string, opts: { preset?: string; type?: string; baseUrl?: string; keyRef?: string }) => {
        const configFile = addConfiguredProvider(id, opts);
        stdout.write(`Added provider "${id}" to ${configFile}\n`);
      },
    );

  prv
    .command('remove <id>')
    .description('Remove a configured provider')
    .action((id: string) => {
      const configFile = removeConfiguredProvider(id);
      stdout.write(`Removed provider "${id}" from ${configFile}\n`);
    });

  prv
    .command('test <id>')
    .description('Probe provider connectivity and model list')
    .action(async (id: string) => {
      const { providerType, models } = await probeProviderModels(id);
      stdout.write(`✓ ${id} (${providerType}): ${String(models.length)} models available\n`);
    });

  program
    .command('models [providerId]')
    .description('Discover available models for a provider')
    .action(async (providerId?: string) => {
      const { providerId: resolvedId, models } = await probeProviderModels(providerId);
      for (const m of models) {
        stdout.write(`${resolvedId}/${m.id}\n`);
      }
    });
}
