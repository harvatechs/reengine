import * as fs from 'node:fs';
import * as path from 'node:path';
import { SessionStore, listSessions } from '../core/index.js';
import { resolveRuntimePaths } from '../platform/index.js';
import { AppError } from '../util/index.js';

export function generateSessionMarkdownReport(
  sessionId?: string,
  outPath?: string,
  cwd = process.cwd(),
): { filePath: string; markdown: string } {
  const paths = resolveRuntimePaths();
  const targetId = sessionId ?? listSessions(paths.sessionsDir)[0]?.id;
  if (!targetId) {
    throw new AppError('SESSION_NOT_FOUND', 'No sessions available to report.');
  }
  const store = new SessionStore(paths.sessionsDir, targetId);
  const evidence = store.loadEvidence();
  const usage = store.loadUsageTotals();

  const observed = evidence.filter((e) => e.status === 'observed');
  const inferred = evidence.filter((e) => e.status === 'inferred');
  const unknown = evidence.filter((e) => e.status === 'unknown');

  const lines = [
    `# ReEngine Analysis Report — \`${targetId}\``,
    '',
    `- **Generated:** ${new Date().toISOString()}`,
    `- **Usage:** ${String(usage.inputTokens)} input / ${String(usage.outputTokens)} output tokens`,
    `- **Evidence:** ${String(observed.length)} observed · ${String(inferred.length)} inferred · ${String(unknown.length)} unknown`,
    '',
    '## Observed Findings',
    ...(observed.length > 0
      ? observed.map(
          (e) =>
            `- **${e.title}**: ${e.summary}${e.source?.location ? ` (${e.source.location})` : ''}`,
        )
      : ['- (none)']),
    '',
    '## Inferred Findings',
    ...(inferred.length > 0 ? inferred.map((e) => `- **${e.title}**: ${e.summary}`) : ['- (none)']),
    '',
    '## Unknowns & Limitations',
    ...(unknown.length > 0
      ? unknown.map((e) => `- **${e.title}**: ${(e.limitations ?? [e.summary]).join('; ')}`)
      : ['- (none)']),
    '',
  ];

  const markdown = lines.join('\n');
  const dest = outPath
    ? path.resolve(cwd, outPath)
    : path.join(cwd, '.reengine', 'reports', `${targetId}.md`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, markdown, 'utf-8');
  return { filePath: dest, markdown };
}
