import { spawn } from 'node:child_process';
import type { Tool, ToolContext, ToolOutput } from '../core/contracts.js';
import { buildScrubbedEnv, killProcessTree } from '../platform/index.js';

function resolveShellInvocation(
  command: string,
  configuredShell?: string,
): { bin: string; args: string[] } {
  if (process.platform === 'win32') {
    const bin = configuredShell ?? 'powershell.exe';
    const lower = bin.toLowerCase();
    if (lower.includes('cmd')) {
      return { bin, args: ['/d', '/s', '/c', command] };
    }
    return { bin, args: ['-NoProfile', '-NonInteractive', '-Command', command] };
  }
  const bin = configuredShell ?? process.env.SHELL ?? '/bin/sh';
  return { bin, args: ['-lc', command] };
}

export function createShellTool(options: {
  timeoutMs?: number;
  maxOutputBytes?: number;
  shell?: string;
  envAllow?: string[];
}): Tool {
  const timeoutMs = options.timeoutMs ?? 120_000;
  const maxOutputBytes = options.maxOutputBytes ?? 1_048_576;

  return {
    name: 'shell',
    description: 'Execute a non-interactive shell command in the workspace with scrubbed env.',
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string' },
        cwd: { type: 'string' },
      },
      required: ['command'],
      additionalProperties: false,
    },
    risk: 'exec',
    readOnly: false,
    destructive: true,
    openWorld: false,
    pathArgs: ['cwd'],
    source: { kind: 'builtin' },
    describe: (input) => `shell(${(input as { command?: string }).command ?? ''})`,
    execute: (input, ctx: ToolContext): Promise<ToolOutput> => {
      const { command, cwd = ctx.cwd } = input as { command: string; cwd?: string };
      const { bin, args } = resolveShellInvocation(command, options.shell);
      const env = buildScrubbedEnv({
        ...(options.envAllow ? { allowExtra: options.envAllow } : {}),
      });

      return new Promise<ToolOutput>((resolve) => {
        const child = spawn(bin, args, {
          cwd,
          env,
          shell: false,
          stdio: ['ignore', 'pipe', 'pipe'],
          detached: process.platform !== 'win32',
        });

        let outBuf = Buffer.alloc(0);
        let timedOut = false;
        let settled = false;

        const appendChunk = (chunk: Buffer): void => {
          const combined = Buffer.concat([outBuf, chunk]);
          outBuf =
            combined.byteLength > maxOutputBytes
              ? combined.subarray(combined.byteLength - maxOutputBytes)
              : combined;
        };

        child.stdout.on('data', appendChunk);
        child.stderr.on('data', appendChunk);

        const timer = setTimeout(() => {
          timedOut = true;
          void killProcessTree(child);
        }, timeoutMs);

        const onAbort = (): void => {
          void killProcessTree(child);
        };
        ctx.signal.addEventListener('abort', onAbort, { once: true });

        const finish = (code: number | null): void => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          ctx.signal.removeEventListener('abort', onAbort);
          const text = outBuf.toString('utf-8').trim();
          const suffix = timedOut
            ? `\n[command timed out after ${String(timeoutMs)}ms]`
            : ctx.signal.aborted
              ? '\n[command aborted]'
              : '';
          resolve({
            isError: timedOut || ctx.signal.aborted || code !== 0,
            content: `${text}${suffix}` || `(exit code ${String(code ?? -1)})`,
          });
        };

        child.once('close', finish);
        child.once('error', (err) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          ctx.signal.removeEventListener('abort', onAbort);
          resolve({ isError: true, content: `Shell spawn failed: ${err.message}` });
        });
      });
    },
  };
}
