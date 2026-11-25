import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EXIT_CODES, mapErrorToExitCode } from '../../../src/cli/exit-codes.js';
import { runCli } from '../../../src/cli/main.js';
import { ConfigError, EngineError, PermissionError } from '../../../src/util/index.js';
import { startMockLlmServer } from '../../mocks/mock-llm.js';

function createBufferStream(): { stream: PassThrough; read: () => string } {
  const stream = new PassThrough();
  const chunks: string[] = [];
  stream.on('data', (chunk: Buffer) => {
    chunks.push(chunk.toString('utf-8'));
  });
  return {
    stream,
    read: () => chunks.join(''),
  };
}

describe('src/cli (P1-09)', () => {
  let tmpDir: string;
  let prevHome: string | undefined;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reengine-cli-'));
    prevHome = process.env.REENGINE_HOME;
    process.env.REENGINE_HOME = tmpDir;
  });

  afterEach(() => {
    if (prevHome === undefined) {
      delete process.env.REENGINE_HOME;
    } else {
      process.env.REENGINE_HOME = prevHome;
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('maps typed errors to deterministic exit codes', () => {
    expect(mapErrorToExitCode(new ConfigError('CONFIG_INVALID', 'bad'))).toBe(
      EXIT_CODES.USAGE_OR_CONFIG,
    );
    expect(mapErrorToExitCode(new EngineError('ENGINE_TIMEOUT', 'down'))).toBe(
      EXIT_CODES.ENGINE_UNAVAILABLE,
    );
    expect(mapErrorToExitCode(new PermissionError('PERMISSION_DENIED', 'nope'))).toBe(
      EXIT_CODES.PERMISSION_UNAVAILABLE,
    );
    const abortErr = new Error('aborted');
    abortErr.name = 'AbortError';
    expect(mapErrorToExitCode(abortErr)).toBe(EXIT_CODES.INTERRUPTED);
  });

  it('prints version without loading ink', async () => {
    const out = createBufferStream();
    const err = createBufferStream();
    const code = await runCli(['node', 'reengine', 'version'], {
      stdout: out.stream,
      stderr: err.stream,
    });
    expect(code).toBe(0);
    expect(out.read()).toContain('reengine-cli');
    expect(out.read()).toContain('rea-agents');
  });

  it('supports config set, get, list, path, schema, validate', async () => {
    const out1 = createBufferStream();
    const err1 = createBufferStream();
    expect(
      await runCli(['node', 'reengine', 'config', 'set', 'ui.theme', 'solarized'], {
        stdout: out1.stream,
        stderr: err1.stream,
      }),
    ).toBe(0);

    const out2 = createBufferStream();
    const err2 = createBufferStream();
    expect(
      await runCli(['node', 'reengine', 'config', 'get', 'ui.theme'], {
        stdout: out2.stream,
        stderr: err2.stream,
      }),
    ).toBe(0);
    expect(out2.read().trim()).toBe('solarized');

    const out3 = createBufferStream();
    const err3 = createBufferStream();
    expect(
      await runCli(['node', 'reengine', 'config', 'validate'], {
        stdout: out3.stream,
        stderr: err3.stream,
      }),
    ).toBe(0);
    expect(out3.read()).toContain('Configuration is valid.');

    const out4 = createBufferStream();
    const err4 = createBufferStream();
    expect(
      await runCli(['node', 'reengine', 'config', 'schema'], {
        stdout: out4.stream,
        stderr: err4.stream,
      }),
    ).toBe(0);
    expect(out4.read()).toContain('ReEngineConfigV1');

    const out5 = createBufferStream();
    const err5 = createBufferStream();
    expect(
      await runCli(['node', 'reengine', 'config', 'path'], {
        stdout: out5.stream,
        stderr: err5.stream,
      }),
    ).toBe(0);
    expect(out5.read()).toContain('user:');
  });

  it('generates shell completions and rejects invalid shell with exit code 2', async () => {
    for (const shell of ['bash', 'zsh', 'fish', 'powershell']) {
      const out = createBufferStream();
      const err = createBufferStream();
      expect(
        await runCli(['node', 'reengine', 'completion', shell], {
          stdout: out.stream,
          stderr: err.stream,
        }),
      ).toBe(0);
      expect(out.read()).toContain('reengine');
    }

    const badOut = createBufferStream();
    const badErr = createBufferStream();
    expect(
      await runCli(['node', 'reengine', 'completion', 'tcsh'], {
        stdout: badOut.stream,
        stderr: badErr.stream,
      }),
    ).toBe(EXIT_CODES.USAGE_OR_CONFIG);
  });

  it('manages providers and probes models against mock LLM', async () => {
    const mock = await startMockLlmServer();
    try {
      const o1 = createBufferStream();
      const e1 = createBufferStream();
      expect(
        await runCli(['node', 'reengine', 'providers', 'presets'], {
          stdout: o1.stream,
          stderr: e1.stream,
        }),
      ).toBe(0);
      expect(o1.read()).toContain('openrouter');

      const o2 = createBufferStream();
      const e2 = createBufferStream();
      expect(
        await runCli(
          [
            'node',
            'reengine',
            'providers',
            'add',
            'localmock',
            '--type',
            'openai-compatible',
            '--base-url',
            `${mock.url}/v1`,
          ],
          { stdout: o2.stream, stderr: e2.stream },
        ),
      ).toBe(0);

      mock.enqueue({ json: { data: [{ id: 'mock-gpt' }] } });
      const o3 = createBufferStream();
      const e3 = createBufferStream();
      expect(
        await runCli(['node', 'reengine', 'providers', 'test', 'localmock'], {
          stdout: o3.stream,
          stderr: e3.stream,
        }),
      ).toBe(0);
      expect(o3.read()).toContain('1 models available');

      mock.enqueue({ json: { data: [{ id: 'mock-gpt' }] } });
      const o4 = createBufferStream();
      const e4 = createBufferStream();
      expect(
        await runCli(['node', 'reengine', 'models', 'localmock'], {
          stdout: o4.stream,
          stderr: e4.stream,
        }),
      ).toBe(0);
      expect(o4.read()).toContain('localmock/mock-gpt');

      const o5 = createBufferStream();
      const e5 = createBufferStream();
      expect(
        await runCli(['node', 'reengine', 'providers', 'remove', 'localmock'], {
          stdout: o5.stream,
          stderr: e5.stream,
        }),
      ).toBe(0);
    } finally {
      await mock.close();
    }
  });

  it('supports theme list/validate/export, doctor --json, setup, and report (P5/P6)', async () => {
    const o1 = createBufferStream();
    const e1 = createBufferStream();
    expect(
      await runCli(['node', 'reengine', 'theme', 'list'], { stdout: o1.stream, stderr: e1.stream }),
    ).toBe(0);
    expect(o1.read()).toContain('reengine-dark');

    const o2 = createBufferStream();
    const e2 = createBufferStream();
    expect(
      await runCli(['node', 'reengine', 'theme', 'validate', 'reengine-dark'], {
        stdout: o2.stream,
        stderr: e2.stream,
      }),
    ).toBe(0);
    expect(o2.read()).toContain('pass text.primary');

    const o3 = createBufferStream();
    const e3 = createBufferStream();
    expect(
      await runCli(['node', 'reengine', 'theme', 'export', '--terminal', 'kitty'], {
        stdout: o3.stream,
        stderr: e3.stream,
      }),
    ).toBe(0);
    expect(o3.read()).toContain('foreground');

    const o4 = createBufferStream();
    const e4 = createBufferStream();
    const docCode = await runCli(['node', 'reengine', 'doctor', '--json'], {
      stdout: o4.stream,
      stderr: e4.stream,
    });
    expect([0, 1]).toContain(docCode);
    const docJson = JSON.parse(o4.read()) as { checks: Array<{ id: string }> };
    expect(docJson.checks.some((c) => c.id === 'node-version')).toBe(true);

    const o5 = createBufferStream();
    const e5 = createBufferStream();
    expect(
      await runCli(['node', 'reengine', 'setup'], { stdout: o5.stream, stderr: e5.stream }),
    ).toBe(0);
    expect(o5.read()).toContain('Setup complete');

    const o6 = createBufferStream();
    const e6 = createBufferStream();
    const repCode = await runCli(['node', 'reengine', 'report'], {
      stdout: o6.stream,
      stderr: e6.stream,
    });
    expect([0, 1]).toContain(repCode);
  }, 20_000);
});
