import type { Command } from 'commander';
import {
  deleteSessionById,
  listSessionSummaries,
  pruneOldSessions,
  readSessionRecords,
} from '../../app/run-service.js';

export function registerSessionsCommand(program: Command, stdout: NodeJS.WritableStream): void {
  const ses = program.command('sessions').description('Inspect and manage saved sessions');

  ses
    .command('list')
    .description('List recorded sessions')
    .action(() => {
      const list = listSessionSummaries();
      if (list.length === 0) {
        stdout.write('No sessions found.\n');
        return;
      }
      for (const s of list) {
        const dt = s.createdAt > 0 ? new Date(s.createdAt).toISOString() : '-';
        stdout.write(`${s.id}  ${dt}  ${s.model || '-'}  (${String(s.messageCount)} msgs)\n`);
      }
    });

  ses
    .command('show <id>')
    .description('Show records for a session')
    .action((id: string) => {
      const records = readSessionRecords(id);
      stdout.write(`${JSON.stringify(records, null, 2)}\n`);
    });

  ses
    .command('export <id>')
    .description('Export a session transcript as JSON')
    .action((id: string) => {
      const records = readSessionRecords(id);
      stdout.write(`${JSON.stringify({ sessionId: id, records }, null, 2)}\n`);
    });

  ses
    .command('delete <id>')
    .description('Delete a session and its artifacts')
    .action((id: string) => {
      const ok = deleteSessionById(id);
      stdout.write(ok ? `Deleted session ${id}\n` : `Session not found: ${id}\n`);
    });

  ses
    .command('prune')
    .description('Prune sessions older than retentionDays')
    .option('--days <n>', 'Retention days override', (v) => Number.parseInt(v, 10))
    .action((opts: { days?: number }) => {
      const removed = pruneOldSessions(opts.days);
      stdout.write(`Pruned ${String(removed)} session(s).\n`);
    });
}
