import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ConfigSchema,
  DEFAULT_CONFIG,
  formatConfigForDisplay,
  grantFolderTrust,
  loadConfig,
  writeConfigEdit,
} from '../../../src/config/index.js';
import { resolveRuntimePaths } from '../../../src/platform/index.js';
import { ConfigError } from '../../../src/util/index.js';

describe('src/config (P1-05)', () => {
  let tmpDir: string;
  let homeDir: string;
  let workspaceDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reengine-cfg-'));
    homeDir = path.join(tmpDir, 'home');
    workspaceDir = path.join(tmpDir, 'workspace');
    fs.mkdirSync(homeDir, { recursive: true });
    fs.mkdirSync(workspaceDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('provides full defaults and matches generated JSON schema keys', () => {
    expect(DEFAULT_CONFIG.version).toBe(1);
    expect(DEFAULT_CONFIG.permissions.mode).toBe('default');
    expect(DEFAULT_CONFIG.engine.rea.schemaProfile).toBe('compact');

    const schemaPath = path.resolve(process.cwd(), 'schemas/config.v1.schema.json');
    const jsonSchema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8')) as {
      definitions?: { ReEngineConfigV1?: { properties?: Record<string, unknown> } };
    };
    const schemaKeys = Object.keys(
      jsonSchema.definitions?.ReEngineConfigV1?.properties ?? {},
    ).sort();
    const zodKeys = Object.keys(ConfigSchema.shape).sort();
    expect(schemaKeys).toEqual(zodKeys);
  });

  it('merges user, trusted project, env, and CLI layers with permission rule concatenation', () => {
    const paths = resolveRuntimePaths({ REENGINE_HOME: homeDir });
    fs.mkdirSync(paths.configDir, { recursive: true });
    fs.writeFileSync(
      paths.configFile,
      `{
        // user comment preserved
        "version": 1,
        "permissions": { "allow": ["read_file(**)"] },
        "ui": { "theme": "solarized" }
      }`,
      'utf-8',
    );

    const projDir = path.join(workspaceDir, '.reengine');
    fs.mkdirSync(projDir, { recursive: true });
    const projConfig = {
      version: 1,
      permissions: { mode: 'bypass', allow: ['glob'], ask: ['shell(*)'] },
      engine: { rea: { provider: 'ghidra' } },
    };
    fs.writeFileSync(path.join(projDir, 'config.jsonc'), JSON.stringify(projConfig), 'utf-8');
    grantFolderTrust(workspaceDir, projConfig, paths.trustFile);

    const loaded = loadConfig({
      cwd: workspaceDir,
      env: {
        REENGINE_HOME: homeDir,
        REENGINE_MODEL: 'openai/gpt-4.1',
        REENGINE_NO_UPDATE_CHECK: '1',
      },
      cliOverrides: { ui: { density: 'compact' } },
    });

    expect(loaded.trustPending).toBe(false);
    expect(loaded.config.model.default).toBe('openai/gpt-4.1');
    expect(loaded.config.ui.theme).toBe('solarized');
    expect(loaded.config.ui.density).toBe('compact');
    expect(loaded.config.updates.check).toBe(false);
    expect(loaded.config.permissions.mode).toBe('default');
    expect(loaded.config.permissions.allow).toEqual(['read_file(**)', 'glob']);
    expect(loaded.config.permissions.ask).toEqual(['shell(*)']);
    expect(loaded.warnings.some((w) => w.code === 'PROJECT_BYPASS_IGNORED')).toBe(true);
  });

  it('reports path-precise validation errors with file:line:col', () => {
    const cfgFile = path.join(tmpDir, 'bad.jsonc');
    fs.writeFileSync(
      cfgFile,
      `{
  "version": 1,
  "providers": {
    "openrouter": {
      "type": "openai-compatible",
      "compat": {
        "maxTokensParam": "tokens"
      }
    }
  }
}`,
      'utf-8',
    );

    expect(() => loadConfig({ configPath: cfgFile, env: { REENGINE_HOME: homeDir } })).toThrowError(
      ConfigError,
    );
    try {
      loadConfig({ configPath: cfgFile, env: { REENGINE_HOME: homeDir } });
    } catch (err) {
      expect((err as Error).message).toContain('config.providers.openrouter.compat.maxTokensParam');
      expect((err as Error).message).toContain(`${cfgFile}:7:`);
    }
  });

  it('rejects reserved mcpServers.rea, non-REA engine env, and insecure http baseUrl', () => {
    const badRes = ConfigSchema.safeParse({
      version: 1,
      mcpServers: { rea: { transport: 'stdio', command: 'rea' } },
      engine: { rea: { env: { PATH: '/bad' } } },
      providers: { p1: { type: 'openai-compatible', baseUrl: 'http://example.com/v1' } },
    });
    expect(badRes.success).toBe(false);
    if (!badRes.success) {
      const paths = badRes.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('mcpServers.rea');
      expect(paths).toContain('engine.rea.env.PATH');
      expect(paths).toContain('providers.p1.baseUrl');
    }
  });

  it('preserves comments during writeConfigEdit, creates .bak on migration, and masks literal secrets', () => {
    const cfgFile = path.join(tmpDir, 'edit.jsonc');
    fs.writeFileSync(
      cfgFile,
      `{\n  // keep this comment\n  "ui": {\n    "theme": "reengine-dark"\n  }\n}\n`,
      'utf-8',
    );
    writeConfigEdit(cfgFile, ['ui', 'theme'], 'high-contrast');
    const updated = fs.readFileSync(cfgFile, 'utf-8');
    expect(updated).toContain('// keep this comment');
    expect(updated).toContain('"high-contrast"');
    expect(updated).toContain('"version": 1');
    expect(fs.existsSync(`${cfgFile}.bak`)).toBe(true);

    const parsed = ConfigSchema.parse({
      version: 1,
      providers: {
        a: { type: 'anthropic', auth: { key: 'sk-ant-literal' } },
        b: { type: 'openai-compatible', auth: { key: 'env:OPENAI_API_KEY' } },
      },
    });
    const safe = formatConfigForDisplay(parsed);
    expect(safe.providers.a?.auth.key).toBe('[REDACTED_LITERAL]');
    expect(safe.providers.b?.auth.key).toBe('env:OPENAI_API_KEY');
  });
});
