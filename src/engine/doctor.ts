import { execFile } from 'node:child_process';
import { z } from 'zod';
import { buildScrubbedEnv } from '../platform/index.js';
import { resolveReaBinary } from './resolver.js';

const ReaDoctorBaseSchema = z.object({}).passthrough();

interface ReaDoctorSection {
  id: string;
  ok: boolean;
  parsed?: unknown;
  raw?: string;
  warning?: string;
}

export interface ReaDoctorReport {
  resolvedCommand: string;
  source: string;
  version?: string;
  sections: ReaDoctorSection[];
}

function runReaCliJson(
  command: string,
  baseArgs: string[],
  subArgs: string[],
  timeoutMs = 15_000,
): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  const execArgs =
    baseArgs[0]?.endsWith('.js') || baseArgs[0]?.endsWith('.mjs')
      ? [baseArgs[0], ...subArgs]
      : subArgs;

  return new Promise((resolve) => {
    execFile(
      command,
      execArgs,
      { env: buildScrubbedEnv({}), timeout: timeoutMs, encoding: 'utf-8' },
      (err, stdout, stderr) => {
        resolve({ ok: !err, stdout: stdout.replace(/^\uFEFF/, ''), stderr });
      },
    );
  });
}

async function probeSection(
  id: string,
  command: string,
  baseArgs: string[],
  subArgs: string[],
): Promise<ReaDoctorSection> {
  const res = await runReaCliJson(command, baseArgs, subArgs);
  try {
    const json = JSON.parse(res.stdout) as unknown;
    const validated = ReaDoctorBaseSchema.safeParse(json);
    if (validated.success) {
      return { id, ok: res.ok, parsed: validated.data };
    }
    return { id, ok: false, raw: res.stdout.slice(0, 500), warning: validated.error.message };
  } catch (e) {
    return {
      id,
      ok: false,
      raw: (res.stdout || res.stderr).slice(0, 500),
      warning: `JSON parse failed: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

export async function runReaDoctor(
  options: {
    configCommand?: string;
    configArgs?: string[];
    allowNpx?: boolean;
    provider?: string;
  } = {},
): Promise<ReaDoctorReport> {
  const resolved = resolveReaBinary(options);
  const queries: Array<{ id: string; args: string[] }> = [
    { id: 'mcp-doctor', args: ['mcp', 'doctor', '--format', 'json'] },
    { id: 'providers', args: ['providers', '--format', 'json'] },
    { id: 'capabilities', args: ['capabilities', '--format', 'json'] },
  ];
  if (options.provider && options.provider !== 'auto') {
    queries.push({
      id: `provider:${options.provider}`,
      args: ['doctor', '--provider', options.provider, '--format', 'json'],
    });
  }

  const sections: ReaDoctorSection[] = [];
  for (const q of queries) {
    sections.push(await probeSection(q.id, resolved.command, resolved.args, q.args));
  }

  return {
    resolvedCommand: resolved.command,
    source: resolved.source,
    ...(resolved.version ? { version: resolved.version } : {}),
    sections,
  };
}
