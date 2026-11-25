import type { Command } from 'commander';
import { runHeadlessTurn } from '../../app/run-service.js';

function collectValues(val: string, prev: string[]): string[] {
  return [...prev, val];
}

export function registerRunCommand(
  program: Command,
  stdout: NodeJS.WritableStream,
  stderr: NodeJS.WritableStream,
): void {
  program
    .command('run <prompt>')
    .description('Run a headless non-interactive reverse-engineering turn')
    .option('-m, --model <ref>', 'Model reference (<providerId>/<modelId>)')
    .option('--output <format>', 'Output format (text|json|stream-json)', 'text')
    .option('--max-steps <n>', 'Maximum agent steps', (v) => Number.parseInt(v, 10))
    .option('--permission-mode <mode>', 'Permission mode (plan|default|acceptEdits)')
    .option('--yolo', 'Bypass permission prompts (requires REENGINE_ALLOW_BYPASS=1)')
    .option('--allow <rule>', 'Allow rule (repeatable)', collectValues, [])
    .option('--target <path>', 'Target file/binary path (repeatable)', collectValues, [])
    .option('--timeout <seconds>', 'Turn timeout in seconds', (v) => Number.parseInt(v, 10))
    .option('--resume <sessionId>', 'Resume a session by id')
    .option('--continue', 'Continue the most recent session')
    .action(
      async (
        prompt: string,
        opts: {
          model?: string;
          output: string;
          maxSteps?: number;
          permissionMode?: string;
          yolo?: boolean;
          allow: string[];
          target: string[];
          timeout?: number;
          resume?: string;
          continue?: boolean;
        },
      ) => {
        const format = opts.output;
        const isStream = format === 'stream-json';
        let initEmitted = false;

        const res = await runHeadlessTurn({
          prompt,
          ...(opts.model ? { model: opts.model } : {}),
          ...(opts.permissionMode ? { permissionMode: opts.permissionMode } : {}),
          ...(opts.yolo ? { yolo: opts.yolo } : {}),
          allowRules: opts.allow,
          targets: opts.target,
          ...(opts.maxSteps !== undefined ? { maxSteps: opts.maxSteps } : {}),
          ...(opts.timeout !== undefined ? { timeoutSeconds: opts.timeout } : {}),
          ...(opts.resume ? { resumeSessionId: opts.resume } : {}),
          ...(opts.continue ? { continueLatest: opts.continue } : {}),
          onEvent: (evt) => {
            if (isStream) {
              if (!initEmitted) {
                initEmitted = true;
                stdout.write(
                  `${JSON.stringify({ type: 'init', model: opts.model ?? 'default' })}\n`,
                );
              }
              stdout.write(`${JSON.stringify(evt)}\n`);
            } else if (evt.type === 'notice' || evt.type === 'error') {
              const msg = evt.type === 'notice' ? evt.message : evt.error.message;
              stderr.write(`${msg}\n`);
            }
          },
        });

        if (format === 'json') {
          stdout.write(
            `${JSON.stringify(
              {
                sessionId: res.sessionId,
                result: res.result,
                usage: res.usage,
                toolCalls: res.toolCalls,
                evidence: res.evidence,
                exitCode: res.exitCode,
              },
              null,
              2,
            )}\n`,
          );
        } else if (isStream) {
          stdout.write(`${JSON.stringify({ type: 'result', ...res })}\n`);
        } else {
          stdout.write(`${res.result}${res.result.endsWith('\n') ? '' : '\n'}`);
        }
        process.exitCode = res.exitCode;
      },
    );
}
