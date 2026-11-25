import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { PassThrough } from 'node:stream';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { runCli } from '../../../src/cli/main.js';
import { startMockLlmServer, type MockLlmServer } from '../../mocks/mock-llm.js';

function bufStream(): { stream: PassThrough; read: () => string } {
  const stream = new PassThrough();
  const chunks: string[] = [];
  stream.on('data', (c: Buffer) => chunks.push(c.toString('utf-8')));
  return { stream, read: () => chunks.join('') };
}

describe('Phase 3 E2E headless agent loop (P3-09..P3-13)', () => {
  let mock: MockLlmServer;
  let tmpDir: string;
  let prevHome: string | undefined;

  beforeAll(async () => {
    mock = await startMockLlmServer();
  });

  afterAll(async () => {
    await mock.close();
  });

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reengine-e2e-p3-'));
    prevHome = process.env.REENGINE_HOME;
    process.env.REENGINE_HOME = path.join(tmpDir, 'home');
    fs.mkdirSync(path.join(tmpDir, 'ws'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'ws', 'hello.txt'), 'secret_marker_42\n', 'utf-8');
  });

  afterEach(() => {
    if (prevHome === undefined) delete process.env.REENGINE_HOME;
    else process.env.REENGINE_HOME = prevHome;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('completes a multi-step tool loop via `reengine run --output json` and lists sessions', async () => {
    const cfgOut = bufStream();
    const cfgErr = bufStream();
    await runCli(
      [
        'node',
        'reengine',
        'providers',
        'add',
        'mock',
        '--type',
        'openai-compatible',
        '--base-url',
        `${mock.url}/v1`,
      ],
      { stdout: cfgOut.stream, stderr: cfgErr.stream },
    );

    mock.enqueue({
      sseChunks: [
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c1","function":{"name":"read_file","arguments":"{\\"path\\":\\"hello.txt\\"}"}}]}}]}\n\n',
        'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n',
        'data: [DONE]\n\n',
      ],
    });
    mock.enqueue({
      sseChunks: [
        'data: {"choices":[{"delta":{"content":"Observed secret_marker_42 in hello.txt."}}]}\n\n',
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
        'data: {"choices":[],"usage":{"prompt_tokens":50,"completion_tokens":15}}\n\n',
        'data: [DONE]\n\n',
      ],
    });

    const prevCwd = process.cwd();
    process.chdir(path.join(tmpDir, 'ws'));
    try {
      const out = bufStream();
      const err = bufStream();
      const code = await runCli(
        ['node', 'reengine', 'run', 'Inspect hello.txt', '-m', 'mock/gpt-test', '--output', 'json'],
        { stdout: out.stream, stderr: err.stream },
      );
      expect(code).toBe(0);
      const parsed = JSON.parse(out.read()) as {
        sessionId: string;
        result: string;
        toolCalls: Array<{ name: string; isError: boolean }>;
      };
      expect(parsed.result).toContain('Observed secret_marker_42');
      expect(parsed.toolCalls[0]?.name).toBe('read_file');
      expect(parsed.toolCalls[0]?.isError).toBe(false);

      const sesOut = bufStream();
      const sesErr = bufStream();
      expect(
        await runCli(['node', 'reengine', 'sessions', 'list'], {
          stdout: sesOut.stream,
          stderr: sesErr.stream,
        }),
      ).toBe(0);
      expect(sesOut.read()).toContain(parsed.sessionId);
    } finally {
      process.chdir(prevCwd);
    }
  });
});
