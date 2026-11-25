import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Command } from 'commander';
import { formatConfigForDisplay, loadConfig, writeConfigEdit } from '../../config/index.js';
import { resolveRuntimePaths } from '../../platform/index.js';
import { ConfigError } from '../../util/index.js';

function getByDotPath(obj: unknown, dotPath: string): unknown {
  const parts = dotPath.split('.').filter(Boolean);
  let cur: unknown = obj;
  for (const part of parts) {
    if (typeof cur !== 'object' || cur === null || !(part in cur)) {
      return undefined;
    }
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function parseValueInput(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

function findBundledSchemaPath(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(here, '../../schemas/config.v1.schema.json'),
    path.resolve(here, '../../../schemas/config.v1.schema.json'),
    path.resolve(process.cwd(), 'schemas/config.v1.schema.json'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  throw new ConfigError('SCHEMA_NOT_FOUND', 'Bundled config.v1.schema.json not found');
}

export function registerConfigCommand(
  program: Command,
  stdout: NodeJS.WritableStream,
  stderr: NodeJS.WritableStream,
): void {
  const cfg = program.command('config').description('Manage ReEngine configuration');

  cfg
    .command('get <key>')
    .description('Get a configuration value by dot path')
    .action((key: string) => {
      const { config } = loadConfig();
      const safe = formatConfigForDisplay(config);
      const val = getByDotPath(safe, key);
      if (val === undefined) {
        throw new ConfigError('CONFIG_KEY_NOT_FOUND', `Configuration key not found: ${key}`);
      }
      const rendered = typeof val === 'string' ? val : JSON.stringify(val, null, 2);
      stdout.write(`${rendered}\n`);
    });

  cfg
    .command('set <key> <value>')
    .description('Set a configuration value in user config (preserves comments)')
    .action((key: string, rawValue: string) => {
      const paths = resolveRuntimePaths();
      const parsed = parseValueInput(rawValue);
      const segments = key.split('.').filter(Boolean);
      if (segments.length === 0) {
        throw new ConfigError('CONFIG_INVALID', 'Configuration key must not be empty');
      }
      writeConfigEdit(paths.configFile, segments, parsed);
      loadConfig();
      stdout.write(`Updated ${key} in ${paths.configFile}\n`);
    });

  cfg
    .command('list')
    .description('Print effective configuration (secrets masked)')
    .action(() => {
      const { config } = loadConfig();
      stdout.write(`${JSON.stringify(formatConfigForDisplay(config), null, 2)}\n`);
    });

  cfg
    .command('path')
    .description('Print active configuration file paths')
    .action(() => {
      const paths = resolveRuntimePaths();
      const loaded = loadConfig();
      stdout.write(`user: ${loaded.userConfigPath ?? `${paths.configFile} (not created)`}\n`);
      if (loaded.projectConfigPath) {
        stdout.write(`project: ${loaded.projectConfigPath}\n`);
      }
    });

  cfg
    .command('edit')
    .description('Open user configuration in $EDITOR')
    .action(() => {
      const paths = resolveRuntimePaths();
      if (!fs.existsSync(paths.configFile)) {
        writeConfigEdit(paths.configFile, ['version'], 1);
      }
      const editor =
        process.env.VISUAL ??
        process.env.EDITOR ??
        (process.platform === 'win32' ? 'notepad' : 'vi');
      spawnSync(editor, [paths.configFile], { stdio: 'inherit' });
    });

  cfg
    .command('schema')
    .description('Print the JSON Schema for config v1')
    .action(() => {
      const schemaPath = findBundledSchemaPath();
      stdout.write(fs.readFileSync(schemaPath, 'utf-8'));
    });

  cfg
    .command('validate')
    .description('Validate user and project configuration files')
    .action(() => {
      const loaded = loadConfig();
      for (const w of loaded.warnings) {
        stderr.write(`warn [${w.code}]: ${w.message}\n`);
      }
      stdout.write('Configuration is valid.\n');
    });
}
