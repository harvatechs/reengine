import type { Command } from 'commander';
import { runFullDoctor } from '../../app/doctor.js';

export function registerDoctorCommand(program: Command, stdout: NodeJS.WritableStream): void {
  program
    .command('doctor')
    .description('Run full environment, config, provider, and REA diagnostics')
    .option('--json', 'Output JSON report')
    .action(async (opts: { json?: boolean }) => {
      const report = await runFullDoctor();
      if (opts.json) {
        stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      } else {
        for (const c of report.checks) {
          const icon = c.status === 'pass' ? '✓' : c.status === 'warn' ? '!' : '✗';
          stdout.write(`${icon} ${c.id}: ${c.message}\n`);
          if (c.remedy) stdout.write(`  remedy: ${c.remedy}\n`);
        }
      }
      if (!report.ok) process.exitCode = 1;
    });
}
