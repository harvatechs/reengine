import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCli } from '../../../src/cli/main.js';
import { ReaSupervisor, TargetRegistry, runReaDoctor } from '../../../src/engine/index.js';
import { startMockLlmServer } from '../../mocks/mock-llm.js';

function bufStream(): { stream: PassThrough; read: () => string } {
  const stream = new PassThrough();
  const chunks: string[] = [];
  stream.on('data', (c: Buffer) => chunks.push(c.toString('utf-8')));
  return { stream, read: () => chunks.join('') };
}

describe('Real REA engine integration (P4-11/P4-12)', () => {
  let tmpDir: string;
  let prevHome: string | undefined;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reengine-rea-e2e-'));
    prevHome = process.env.REENGINE_HOME;
    process.env.REENGINE_HOME = path.join(tmpDir, 'home');
  });

  afterEach(() => {
    if (prevHome === undefined) delete process.env.REENGINE_HOME;
    else process.env.REENGINE_HOME = prevHome;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('starts real REA supervisor, calls analyze_javascript_application on fixture, and shuts down cleanly', async () => {
    const jsFixture = path.resolve(process.cwd(), 'test/fixtures/js-app');
    const targets = new TargetRegistry([jsFixture]);
    const sup = new ReaSupervisor({
      workspaceRoot: process.cwd(),
      targets,
      autoSnapshot: false,
    });

    try {
      await sup.ensureStarted();
      expect(sup.getState()).toBe('ready');
      const tools = sup.getTools();
      expect(tools.length).toBe(170);

      const analyzeTool = tools.find(
        (t) =>
          t.source.kind === 'mcp' && t.source.originalName === 'analyze_javascript_application',
      );
      expect(analyzeTool).toBeDefined();
      const out = await analyzeTool?.execute(
        { input_path: jsFixture },
        {
          cwd: process.cwd(),
          workspaceRoot: process.cwd(),
          signal: new AbortController().signal,
          reportProgress: () => undefined,
        },
      );
      expect(out?.isError).toBe(false);
      expect(out?.evidence?.length).toBeGreaterThan(0);
    } finally {
      await sup.stop();
    }
    expect(sup.getState()).toBe('absent');
  }, 30_000);

  it('runs rea doctor and headless `reengine run` with real REA + mock LLM', async () => {
    const doc = await runReaDoctor();
    expect(doc.source).toBe('bundled');
    expect(doc.sections.some((s) => s.id === 'providers')).toBe(true);

    const mock = await startMockLlmServer();
    try {
      const o1 = bufStream();
      const e1 = bufStream();
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
        { stdout: o1.stream, stderr: e1.stream },
      );

      const jsFixture = path.resolve(process.cwd(), 'test/fixtures/js-app');
      mock.enqueue({
        sseChunks: [
          `data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c_rea","function":{"name":"mcp__rea__analyze_javascript_application","arguments":${JSON.stringify(JSON.stringify({ input_path: jsFixture }))}}}]}}]}\n\n`,
          'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n',
          'data: [DONE]\n\n',
        ],
      });
      mock.enqueue({
        sseChunks: [
          'data: {"choices":[{"delta":{"content":"Observed handleIpc and loadLocalConfig exports."}}]}\n\n',
          'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
          'data: [DONE]\n\n',
        ],
      });

      const out = bufStream();
      const err = bufStream();
      const code = await runCli(
        [
          'node',
          'reengine',
          'run',
          'Analyze test/fixtures/js-app',
          '-m',
          'mock/gpt-test',
          '--target',
          jsFixture,
          '--allow',
          'mcp__rea__*',
          '--output',
          'json',
        ],
        { stdout: out.stream, stderr: err.stream },
      );
      expect(err.read()).toBe('');
      expect(code).toBe(0);
      const parsed = JSON.parse(out.read()) as {
        result: string;
        toolCalls: Array<{ name: string; isError: boolean }>;
        evidence: Array<{ status: string }>;
      };
      expect(parsed.result).toContain('Observed handleIpc');
      expect(parsed.toolCalls[0]?.name).toBe('mcp__rea__analyze_javascript_application');
      expect(parsed.toolCalls[0]?.isError).toBe(false);
      expect(parsed.evidence.length).toBeGreaterThan(0);
    } finally {
      await mock.close();
    }
  }, 45_000);
});
