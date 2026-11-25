import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ConfigError, type SecretRedactor } from '../util/index.js';

type SecretSourceScope = 'user' | 'project' | 'env' | 'flag';

export type ParsedSecretRef =
  | { kind: 'env'; name: string }
  | { kind: 'file'; filePath: string }
  | { kind: 'keychain'; account: string }
  | { kind: 'literal'; value: string };

export interface ResolveSecretOptions {
  sourceScope: SecretSourceScope;
  redactor?: SecretRedactor;
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  platform?: NodeJS.Platform;
  keychainLookup?: (service: string, account: string) => Promise<string | null>;
  onWarning?: (code: string, message: string) => void;
}

export function parseSecretRef(raw: string): ParsedSecretRef {
  if (raw.startsWith('env:')) {
    const name = raw.slice('env:'.length).trim();
    if (!name) {
      throw new ConfigError(
        'SECRET_INVALID_REF',
        'Secret reference "env:" requires a variable name',
      );
    }
    return { kind: 'env', name };
  }
  if (raw.startsWith('file:')) {
    const filePath = raw.slice('file:'.length).trim();
    if (!filePath) {
      throw new ConfigError('SECRET_INVALID_REF', 'Secret reference "file:" requires a file path');
    }
    return { kind: 'file', filePath };
  }
  if (raw.startsWith('keychain:')) {
    const account = raw.slice('keychain:'.length).trim();
    if (!account) {
      throw new ConfigError(
        'SECRET_INVALID_REF',
        'Secret reference "keychain:" requires an account name',
      );
    }
    return { kind: 'keychain', account };
  }
  return { kind: 'literal', value: raw };
}

export function isSecretReference(raw: string): boolean {
  return raw.startsWith('env:') || raw.startsWith('file:') || raw.startsWith('keychain:');
}

async function defaultKeychainLookup(service: string, account: string): Promise<string | null> {
  try {
    const modName = '@napi-rs/keyring';
    const mod = (await import(modName)) as {
      Entry?: new (svc: string, acc: string) => { getPassword: () => string | null };
    };
    if (typeof mod.Entry !== 'function') {
      throw new ConfigError('KEYCHAIN_UNAVAILABLE', 'OS keychain module did not export Entry');
    }
    const entry = new mod.Entry(service, account);
    return entry.getPassword();
  } catch (err) {
    if (err instanceof ConfigError) {
      throw err;
    }
    throw new ConfigError(
      'KEYCHAIN_UNAVAILABLE',
      `Keychain backend unavailable: ${err instanceof Error ? err.message : String(err)}`,
      { remedy: 'Install @napi-rs/keyring or use env: / file: secret references instead.' },
    );
  }
}

function resolveEnvSecret(name: string, env: NodeJS.ProcessEnv): string {
  const val = env[name];
  if (val === undefined || val === '') {
    throw new ConfigError('SECRET_MISSING', `Environment variable "${name}" is not set or empty.`, {
      remedy: `Export ${name} before running reengine.`,
    });
  }
  return val;
}

function resolveFileSecret(filePath: string, options: ResolveSecretOptions): string {
  const home = options.homeDir ?? os.homedir();
  const target = filePath.startsWith('~/')
    ? path.join(home, filePath.slice(2))
    : path.resolve(filePath);
  if (!fs.existsSync(target)) {
    throw new ConfigError('SECRET_MISSING', `Secret file not found: ${target}`);
  }
  const plat = options.platform ?? process.platform;
  if (plat !== 'win32' && (fs.statSync(target).mode & 0o044) !== 0) {
    options.onWarning?.(
      'SECRET_FILE_PERMISSIONS',
      `Secret file ${target} is readable by group/others; recommend chmod 600.`,
    );
  }
  const resolved = fs.readFileSync(target, 'utf-8').trim();
  if (!resolved) {
    throw new ConfigError('SECRET_MISSING', `Secret file is empty: ${target}`);
  }
  return resolved;
}

async function resolveKeychainSecret(
  account: string,
  options: ResolveSecretOptions,
): Promise<string> {
  const lookup = options.keychainLookup ?? defaultKeychainLookup;
  const val = await lookup('reengine-cli', account);
  if (val === null || val === '') {
    throw new ConfigError('SECRET_MISSING', `Keychain entry "reengine-cli/${account}" not found.`, {
      remedy: 'Store the credential in your OS keychain or switch to env:/file:.',
    });
  }
  return val;
}

export async function resolveSecret(raw: string, options: ResolveSecretOptions): Promise<string> {
  const parsed = parseSecretRef(raw);
  let resolved: string;

  switch (parsed.kind) {
    case 'literal':
      if (options.sourceScope === 'project') {
        throw new ConfigError(
          'SECRET_LITERAL_FORBIDDEN',
          'Literal secrets are forbidden in project config; use env:, file:, or keychain:.',
        );
      }
      options.onWarning?.(
        'SECRET_LITERAL',
        'Literal secret in user config; prefer env:, file:, or keychain: references.',
      );
      resolved = parsed.value;
      break;
    case 'env':
      resolved = resolveEnvSecret(parsed.name, options.env ?? process.env);
      break;
    case 'file':
      resolved = resolveFileSecret(parsed.filePath, options);
      break;
    case 'keychain':
      resolved = await resolveKeychainSecret(parsed.account, options);
      break;
  }

  options.redactor?.registerSecret(resolved);
  return resolved;
}

export function maskSecretForDisplay(raw: string): string {
  return isSecretReference(raw) ? raw : '[REDACTED_LITERAL]';
}
