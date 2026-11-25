import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command, CommanderError } from 'commander';
import { registerCompletionCommand } from './commands/completion.js';
import { registerConfigCommand } from './commands/config.js';
import { registerEngineCommands } from './commands/engine.js';
import { registerMcpCommands } from './commands/mcp.js';
import { registerProvidersCommands } from './commands/providers.js';
import { registerRunCommand } from './commands/run.js';
import { registerSessionsCommand } from './commands/sessions.js';
import { EXIT_CODES, mapErrorToExitCode } from './exit-codes.js';

interface PackageMeta {
  version: string;
  reaVersion: string;
}

function readPackageMeta(): PackageMeta {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(here, '../../package.json'),
    path.resolve(here, '../package.json'),
    path.resolve(process.cwd(), 'package.json'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      const parsed = JSON.parse(fs.readFileSync(candidate, 'utf-8')) as {
        version?: string;
        dependencies?: Record<string, string>;
      };
      return {
        version: parsed.version ?? '0.0.0',
        reaVersion: parsed.dependencies?.['rea-agents'] ?? 'unknown',
      };
    }
  }
  return { version: '0.0.0', reaVersion: 'unknown' };
}

export interface CliIo {
  stdout: NodeJS.WritableStream;
  stderr: NodeJS.WritableStream;
}

export async function runCli(
  argv: readonly string[] = process.argv,
  io: CliIo = { stdout: process.stdout, stderr: process.stderr },
): Promise<number> {
  const meta = readPackageMeta();
  const program = new Command();

  program
    .name('reengine')
    .description('Model-agnostic reverse-engineering terminal harness')
    .version(meta.version, '-v, --version', 'Output ReEngine CLI version')
    .configureOutput({
      writeOut: (str) => {
        io.stdout.write(str);
      },
      writeErr: (str) => {
        io.stderr.write(str);
      },
    })
    .exitOverride();

  program
    .command('version')
    .description('Print ReEngine CLI, REA engine, Node.js, and platform versions')
    .action(() => {
      io.stdout.write(
        `reengine-cli ${meta.version} (rea-agents ${meta.reaVersion}, node ${process.version}, ${process.platform}/${process.arch})\n`,
      );
    });

  registerConfigCommand(program, io.stdout, io.stderr);
  registerProvidersCommands(program, io.stdout);
  registerRunCommand(program, io.stdout, io.stderr);
  registerSessionsCommand(program, io.stdout);
  registerEngineCommands(program, io.stdout);
  registerMcpCommands(program, io.stdout);
  registerCompletionCommand(program, io.stdout);

  try {
    await program.parseAsync([...argv]);
    return EXIT_CODES.SUCCESS;
  } catch (err) {
    if (err instanceof CommanderError && err.code === 'commander.helpDisplayed') {
      return EXIT_CODES.SUCCESS;
    }
    if (err instanceof CommanderError && err.code === 'commander.version') {
      return EXIT_CODES.SUCCESS;
    }
    const code = mapErrorToExitCode(err);
    const msg = err instanceof Error ? err.message : String(err);
    if (msg && !(err instanceof CommanderError)) {
      io.stderr.write(`Error: ${msg}\n`);
    }
    return code;
  }
}

const isEntrypoint =
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith('cli.js') ||
    process.argv[1].endsWith('reengine.js') ||
    process.argv[1].endsWith('main.ts'));

if (isEntrypoint) {
  const exitCode = await runCli(process.argv);
  process.exitCode = exitCode;
}
