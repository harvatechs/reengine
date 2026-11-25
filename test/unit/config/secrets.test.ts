import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseSecretRef, resolveSecret } from '../../../src/config/index.js';
import { ConfigError, SecretRedactor } from '../../../src/util/index.js';

describe('src/config/secrets (P1-06)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reengine-sec-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('parses env:, file:, keychain:, and literal references', () => {
    expect(parseSecretRef('env:OPENAI_API_KEY')).toEqual({ kind: 'env', name: 'OPENAI_API_KEY' });
    expect(parseSecretRef('file:~/secret.txt')).toEqual({ kind: 'file', filePath: '~/secret.txt' });
    expect(parseSecretRef('keychain:openrouter')).toEqual({
      kind: 'keychain',
      account: 'openrouter',
    });
    expect(parseSecretRef('raw-token')).toEqual({ kind: 'literal', value: 'raw-token' });
  });

  it('resolves env: and file: secrets and registers them with SecretRedactor', async () => {
    const redactor = new SecretRedactor();
    const envVal = await resolveSecret('env:MY_API_KEY', {
      sourceScope: 'user',
      env: { MY_API_KEY: 'secret_from_env_12345' },
      redactor,
    });
    expect(envVal).toBe('secret_from_env_12345');
    expect(redactor.redactText(`key=${envVal}`)).toBe('key=[REDACTED_SECRET]');

    const secretFile = path.join(tmpDir, 'token.txt');
    fs.writeFileSync(secretFile, '  secret_from_file_999  \n', 'utf-8');
    const fileVal = await resolveSecret(`file:${secretFile}`, {
      sourceScope: 'project',
      redactor,
      platform: 'win32',
    });
    expect(fileVal).toBe('secret_from_file_999');
  });

  it('warns on literal secrets in user config and rejects them in project config', async () => {
    const warnings: string[] = [];
    const userVal = await resolveSecret('sk-user-literal-1234', {
      sourceScope: 'user',
      onWarning: (code) => {
        warnings.push(code);
      },
    });
    expect(userVal).toBe('sk-user-literal-1234');
    expect(warnings).toContain('SECRET_LITERAL');

    await expect(
      resolveSecret('sk-proj-literal-1234', { sourceScope: 'project' }),
    ).rejects.toThrowError(ConfigError);
  });

  it('resolves keychain: via injected lookup or fails cleanly when missing', async () => {
    const val = await resolveSecret('keychain:anthropic', {
      sourceScope: 'user',
      keychainLookup: (_svc, acc) => Promise.resolve(acc === 'anthropic' ? 'kc_secret_123' : null),
    });
    expect(val).toBe('kc_secret_123');

    await expect(
      resolveSecret('keychain:missing', {
        sourceScope: 'user',
        keychainLookup: () => Promise.resolve(null),
      }),
    ).rejects.toThrowError(ConfigError);
  });
});
