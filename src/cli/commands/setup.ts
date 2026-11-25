import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Command } from 'commander';
import { addConfiguredProvider } from '../../app/providers-service.js';
import { writeConfigEdit } from '../../config/index.js';
import { detectTerminalCapabilities, resolveRuntimePaths } from '../../platform/index.js';
import { renderBrandLogoAnsi } from '../../ui/theme/brand-logo.js';

export function registerSetupCommand(program: Command, stdout: NodeJS.WritableStream): void {
  program
    .command('setup')
    .description('Configure default provider, model, theme, and acknowledge authorized-use stance')
    .option(
      '--preset <id>',
      'Provider preset (e.g. openrouter, anthropic, openai, ollama)',
      'openrouter',
    )
    .option('--model <ref>', 'Default model reference (e.g. openrouter/anthropic/claude-sonnet-4)')
    .option('--theme <name>', 'UI theme name', 'reengine-dark')
    .action((opts: { preset: string; model?: string; theme: string }) => {
      const paths = resolveRuntimePaths();
      addConfiguredProvider(opts.preset, { preset: opts.preset });
      if (opts.model) {
        writeConfigEdit(paths.configFile, ['model', 'default'], opts.model);
      }
      writeConfigEdit(paths.configFile, ['ui', 'theme'], opts.theme);
      fs.mkdirSync(paths.stateDir, { recursive: true });
      fs.writeFileSync(
        path.join(paths.stateDir, 'responsible-use.json'),
        JSON.stringify({ acknowledgedAt: new Date().toISOString(), version: '1.0.0' }, null, 2) +
          '\n',
        'utf-8',
      );
      const term = detectTerminalCapabilities();
      stdout.write(
        renderBrandLogoAnsi({
          colorDepth: term.colorDepth,
          unicode: term.unicode,
          plain: !term.isTTY,
        }),
      );
      stdout.write(
        `Setup complete (${paths.configFile}). ReEngine is for authorized reverse-engineering only.\n`,
      );
    });
}
