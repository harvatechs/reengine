import type { Command } from 'commander';
import {
  getEngineDoctor,
  getEngineStatus,
  listEngineToolsCatalog,
} from '../../app/engine-service.js';

export function registerEngineCommands(program: Command, stdout: NodeJS.WritableStream): void {
  const eng = program
    .command('engine')
    .description('Inspect and diagnose the built-in REA engine (authorized targets only)');

  eng
    .command('status')
    .description('Show REA engine resolution and configuration status')
    .action(() => {
      const status = getEngineStatus();
      if (!status.enabled) {
        stdout.write('REA engine: disabled\n');
        return;
      }
      stdout.write(
        `REA engine: ${status.resolved?.source ?? 'unknown'} (${status.resolved?.version ?? 'unknown'}) -> ${status.resolved?.command ?? ''}\n`,
      );
    });

  eng
    .command('doctor')
    .description('Run REA engine diagnostics')
    .action(async () => {
      const report = await getEngineDoctor();
      stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    });

  eng
    .command('providers')
    .description('Show REA backend analysis providers')
    .action(async () => {
      const report = await getEngineDoctor();
      const sec = report.sections.find((s) => s.id === 'providers');
      stdout.write(`${JSON.stringify(sec?.parsed ?? sec, null, 2)}\n`);
    });

  eng
    .command('capabilities')
    .description('Show REA engine capabilities')
    .action(async () => {
      const report = await getEngineDoctor();
      const sec = report.sections.find((s) => s.id === 'capabilities');
      stdout.write(`${JSON.stringify(sec?.parsed ?? sec, null, 2)}\n`);
    });

  eng
    .command('tools')
    .description('List classified REA tool policy entries')
    .action(() => {
      const tools = listEngineToolsCatalog();
      for (const t of tools) {
        stdout.write(`${t.name.padEnd(42)} ${t.risk.padEnd(8)} readOnly=${String(t.readOnly)}\n`);
      }
    });
}
