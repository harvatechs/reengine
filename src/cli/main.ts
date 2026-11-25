import * as fs from 'node:fs';
import * as path from 'node:path';
import sea from 'node:sea';
import { fileURLToPath } from 'node:url';
import { Command, CommanderError } from 'commander';
import { registerCompletionCommand } from './commands/completion.js';
import { registerConfigCommand } from './commands/config.js';
import { registerDoctorCommand } from './commands/doctor.js';
import { registerEngineCommands } from './commands/engine.js';
import { registerMcpCommands } from './commands/mcp.js';
import { registerProvidersCommands } from './commands/providers.js';
import { registerReportCommand } from './commands/report.js';
import { registerRunCommand } from './commands/run.js';
import { registerSessionsCommand } from './commands/sessions.js';
import { registerSetupCommand } from './commands/setup.js';
import { registerThemeCommands } from './commands/theme.js';
import { EXIT_CODES, mapErrorToExitCode } from './exit-codes.js';

interface PackageMeta {
  version: string;
  reaVersion: string;
}

function readPackageMeta(): PackageMeta {
  const here =
    typeof import.meta.url === 'string' && import.meta.url
      ? path.dirname(fileURLToPath(import.meta.url))
      : path.dirname(process.execPath);
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
        version: parsed.version ?? '0.1.0',
        reaVersion: parsed.dependencies?.['rea-agents'] ?? '6.4.0',
      };
    }
  }
  return { version: '0.1.0', reaVersion: '6.4.0' };
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
    .enablePositionalOptions()
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
  registerThemeCommands(program, io.stdout);
  registerDoctorCommand(program, io.stdout);
  registerReportCommand(program, io.stdout);
  registerSetupCommand(program, io.stdout);
  registerCompletionCommand(program, io.stdout);

  program
    .argument('[prompt]', 'Optional initial prompt for interactive TUI')
    .option('-m, --model <ref>', 'Default model reference')
    .option('--theme <name>', 'UI theme override')
    .option('--plain', 'Accessible plain-text mode')
    .option('--continue', 'Continue most recent session')
    .option('--resume <id>', 'Resume session by id')
    .action(
      async (
        prompt: string | undefined,
        opts: {
          model?: string;
          theme?: string;
          plain?: boolean;
          continue?: boolean;
          resume?: string;
        },
      ) => {
        const { launchInteractiveSession } = await import('../app/interactive.js');
        const code = await launchInteractiveSession({
          ...(prompt ? { initialPrompt: prompt } : {}),
          ...(opts.model ? { model: opts.model } : {}),
          ...(opts.theme ? { themeName: opts.theme } : {}),
          ...(opts.plain ? { plain: opts.plain } : {}),
          ...(opts.continue ? { continueLatest: opts.continue } : {}),
          ...(opts.resume ? { resumeId: opts.resume } : {}),
        });
        process.exitCode = code;
      },
    );

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
  sea.isSea() ||
  (process.argv[1] !== undefined &&
    (process.argv[1].endsWith('cli.js') ||
      process.argv[1].endsWith('reengine.js') ||
      process.argv[1].endsWith('main.ts')));

if (isEntrypoint) {
  void runCli(process.argv).then((exitCode) => {
    process.exitCode = exitCode;
  });
}
