import { spawn } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import {
  ResourceScope,
  TERMINAL_RESTORE_SEQUENCE,
  type TerminalCapabilities,
  buildScrubbedEnv,
  detectColorDepth,
  detectTerminalCapabilities,
  detectTerminalEmulator,
  killProcessTree,
  resolveRuntimePaths,
  restoreTerminalState,
} from '../../../src/platform/index.js';

describe('src/platform (P1-04)', () => {
  it('resolves REENGINE_HOME override and platform-specific paths', () => {
    const testPaths = resolveRuntimePaths({ REENGINE_HOME: '/tmp/ree-home' }, 'linux', '/home/u');
    expect(testPaths.configDir).toContain('ree-home');
    expect(testPaths.sessionsDir).toContain('sessions');

    const winPaths = resolveRuntimePaths(
      { APPDATA: 'C:\\Users\\u\\AppData\\Roaming', LOCALAPPDATA: 'C:\\Users\\u\\AppData\\Local' },
      'win32',
      'C:\\Users\\u',
    );
    expect(winPaths.configFile).toContain('config.jsonc');
    expect(winPaths.trustFile).toContain('trust.json');
  });

  it('scrubs provider API keys and non-allowlisted vars from child env', () => {
    const scrubbed = buildScrubbedEnv({
      sourceEnv: {
        PATH: '/usr/bin',
        LANG: 'en_US.UTF-8',
        LC_ALL: 'C',
        ANTHROPIC_API_KEY: 'sk-ant-secret-value',
        OPENAI_API_KEY: 'sk-openai-secret-value',
        CUSTOM_PASSTHROUGH: 'allowed-val',
      },
      allowExtra: ['CUSTOM_PASSTHROUGH'],
      overrides: { REA_ANALYSIS_PROVIDER: 'ghidra' },
    });

    expect(scrubbed.PATH).toBe('/usr/bin');
    expect(scrubbed.LC_ALL).toBe('C');
    expect(scrubbed.CUSTOM_PASSTHROUGH).toBe('allowed-val');
    expect(scrubbed.REA_ANALYSIS_PROVIDER).toBe('ghidra');
    expect(scrubbed.ANTHROPIC_API_KEY).toBeUndefined();
    expect(scrubbed.OPENAI_API_KEY).toBeUndefined();
  });

  it('respects NO_COLOR and restores terminal state', () => {
    expect(detectColorDepth({ NO_COLOR: '1', COLORTERM: 'truecolor' }, true)).toBe('none');
    expect(detectColorDepth({ COLORTERM: 'truecolor' }, true)).toBe('truecolor');
    expect(detectTerminalEmulator({ WT_SESSION: '1' })).toBe('windows-terminal');
    const caps: TerminalCapabilities = detectTerminalCapabilities({
      COLORTERM: 'truecolor',
      WT_SESSION: '1',
    });
    expect(caps.emulator).toBe('windows-terminal');

    let written = '';
    restoreTerminalState((chunk) => {
      written += chunk;
    });
    expect(written).toBe(TERMINAL_RESTORE_SEQUENCE);
  });

  it('kills spawned child process tree and closes ResourceScope', async () => {
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
      stdio: 'ignore',
      detached: process.platform !== 'win32',
    });
    expect(child.pid).toBeDefined();
    await killProcessTree(child, { graceMs: 200 });
    expect(child.exitCode !== null || child.killed).toBe(true);

    const closed: string[] = [];
    const scope = new ResourceScope();
    scope.register(() => {
      closed.push('first');
    });
    scope.register(() => {
      closed.push('second');
    });
    await scope.closeAll();
    expect(closed).toEqual(['second', 'first']);
  });
});
