import { createHash } from 'node:crypto';
import type { JsonSchema } from '../core/contracts.js';

const PATH_ARG_RE =
  /^(path|file|dir|directory|input_path|output_path|snapshot_path|target|cwd)$|_(path|file|dir)$/;

export function sanitizeMcpToolName(
  server: string,
  originalName: string,
  usedNames: Set<string>,
): string {
  const cleanServer = server.replace(/[^a-zA-Z0-9_-]/g, '_');
  const cleanTool = originalName.replace(/[^a-zA-Z0-9_-]/g, '_');
  let candidate = `mcp__${cleanServer}__${cleanTool}`;
  if (candidate.length > 64) {
    const hash = createHash('sha256').update(`${server}:${originalName}`).digest('hex').slice(0, 8);
    candidate = `${candidate.slice(0, 55)}_${hash}`;
  }
  if (!usedNames.has(candidate)) {
    usedNames.add(candidate);
    return candidate;
  }
  const disambig = createHash('sha256')
    .update(`${server}:${originalName}:${String(usedNames.size)}`)
    .digest('hex')
    .slice(0, 8);
  const unique = `${candidate.slice(0, 55)}_${disambig}`;
  usedNames.add(unique);
  return unique;
}

export function inferPathArgsFromSchema(inputSchema: JsonSchema): string[] {
  const props = inputSchema.properties;
  if (typeof props !== 'object' || props === null) {
    return [];
  }
  const out: string[] = [];
  for (const [key, val] of Object.entries(props as Record<string, unknown>)) {
    if (typeof val !== 'object' || val === null) continue;
    const prop = val as { type?: unknown; format?: unknown };
    if (prop.type === 'string' && (PATH_ARG_RE.test(key) || prop.format === 'path')) {
      out.push(key);
    }
  }
  return out;
}
