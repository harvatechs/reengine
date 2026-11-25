import type { Command } from 'commander';
import { generateSessionMarkdownReport } from '../../app/report.js';

export function registerReportCommand(program: Command, stdout: NodeJS.WritableStream): void {
  program
    .command('report [sessionId]')
    .description('Export a Markdown evidence report from a session')
    .option('--out <path>', 'Output Markdown file path')
    .action((sessionId: string | undefined, opts: { out?: string }) => {
      const res = generateSessionMarkdownReport(sessionId, opts.out);
      stdout.write(`Report written to ${res.filePath}\n`);
    });
}
