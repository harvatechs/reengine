import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  AppError,
  ConfigError,
  EngineError,
  InvariantError,
  McpError,
  PermissionError,
  SecretRedactor,
  SessionError,
  ToolError,
  type Clock,
  combineSignals,
  createFileLogger,
  createNullLogger,
  createSortableId,
  err,
  isAbortError,
  ok,
  systemClock,
  throwIfAborted,
} from '../../../src/util/index.js';

describe('src/util (P1-03)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reengine-util-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates ok/err Results and typed AppError hierarchy', () => {
    const good = ok(42);
    const bad = err(new ConfigError('CONFIG_INVALID', 'bad value', { remedy: 'fix key' }));
    expect(good.ok).toBe(true);
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.error).toBeInstanceOf(AppError);
      expect(bad.error.code).toBe('CONFIG_INVALID');
      expect(bad.error.remedy).toBe('fix key');
    }

    const errors = [
      new McpError('MCP_PROTOCOL_ERROR', 'mcp'),
      new EngineError('ENGINE_TIMEOUT', 'eng'),
      new PermissionError('PERMISSION_DENIED', 'perm'),
      new ToolError('TOOL_FAILED', 'tool'),
      new SessionError('SESSION_CORRUPT', 'sess'),
      new InvariantError('inv'),
    ];
    expect(errors.every((e) => e instanceof AppError)).toBe(true);

    const clock: Clock = systemClock;
    expect(clock.now()).toBeGreaterThan(0);

    const nullLog = createNullLogger();
    nullLog.debug('noop');
  });

  it('generates monotonic sortable IDs', () => {
    const a = createSortableId('ses', 1000);
    const b = createSortableId('ses', 2000);
    expect(a.startsWith('ses_')).toBe(true);
    expect(b > a).toBe(true);
  });

  it('redacts registered secrets and common key patterns in text, objects, and logs', async () => {
    const redactor = new SecretRedactor();
    const seeded = 'my_super_secret_token_998877';
    redactor.registerSecret(seeded);

    expect(redactor.redactText(`token=${seeded}`)).not.toContain(seeded);
    expect(redactor.redactText('sk-ant-1234567890abcdef')).toBe('[REDACTED_ANTHROPIC_KEY]');
    expect(redactor.redactText('Bearer abcdefghijklmnopqrstuvwxyz')).toBe(
      'Bearer [REDACTED_TOKEN]',
    );

    const obj = redactor.redactValue({ apiKey: 'secret_val_1234', nested: seeded });
    expect(obj.apiKey).toBe('[REDACTED]');
    expect(obj.nested).toBe('[REDACTED_SECRET]');

    const logger = createFileLogger({ logDir: tmpDir, redactor, dateStr: '2026-11-25' });
    logger.info(`connecting with ${seeded}`, { apiKey: seeded });
    await new Promise((r) => setTimeout(r, 50));

    const logContent = fs.readFileSync(path.join(tmpDir, 'reengine-2026-11-25.log'), 'utf-8');
    expect(logContent).not.toContain(seeded);
  });

  it('handles AbortSignal helpers cleanly', () => {
    const ac1 = new AbortController();
    const ac2 = new AbortController();
    const combined = combineSignals(ac1.signal, ac2.signal);
    expect(combined.aborted).toBe(false);
    ac2.abort();
    expect(combined.aborted).toBe(true);
    expect(() => {
      throwIfAborted(combined);
    }).toThrow();
    try {
      throwIfAborted(combined);
    } catch (e) {
      expect(isAbortError(e)).toBe(true);
    }
  });
});
