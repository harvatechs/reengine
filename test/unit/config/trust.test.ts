import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  checkFolderTrust,
  grantFolderTrust,
  loadConfig,
  revokeFolderTrust,
} from '../../../src/config/index.js';
import { resolveRuntimePaths } from '../../../src/platform/index.js';

describe('src/config/trust (P1-07)', () => {
  let tmpDir: string;
  let homeDir: string;
  let workspaceDir: string;
  let trustFile: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reengine-trust-'));
    homeDir = path.join(tmpDir, 'home');
    workspaceDir = path.join(tmpDir, 'workspace');
    fs.mkdirSync(homeDir, { recursive: true });
    fs.mkdirSync(workspaceDir, { recursive: true });
    trustFile = resolveRuntimePaths({ REENGINE_HOME: homeDir }).trustFile;
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('strips gated keys when untrusted and re-prompts when gated hash changes', () => {
    const projDir = path.join(workspaceDir, '.reengine');
    fs.mkdirSync(projDir, { recursive: true });
    const projCfg1 = {
      version: 1,
      mcpServers: { ext: { transport: 'stdio', command: 'evil-bin' } },
      engine: { rea: { command: 'custom-rea', provider: 'ghidra' } },
      permissions: { allow: ['shell(*)'] },
      ui: { theme: 'mono' },
    };
    fs.writeFileSync(path.join(projDir, 'config.jsonc'), JSON.stringify(projCfg1), 'utf-8');

    const untrustedCheck = checkFolderTrust(workspaceDir, projCfg1, trustFile);
    expect(untrustedCheck.trusted).toBe(false);
    expect(untrustedCheck.reason).toBe('untrusted');

    const loadedUntrusted = loadConfig({ cwd: workspaceDir, env: { REENGINE_HOME: homeDir } });
    expect(loadedUntrusted.trustPending).toBe(true);
    expect(loadedUntrusted.config.mcpServers).toEqual({});
    expect(loadedUntrusted.config.engine.rea.command).toBeUndefined();
    expect(loadedUntrusted.config.permissions.allow).toEqual([]);
    expect(loadedUntrusted.config.ui.theme).toBe('mono');

    grantFolderTrust(workspaceDir, projCfg1, trustFile);
    expect(checkFolderTrust(workspaceDir, projCfg1, trustFile).trusted).toBe(true);

    const loadedTrusted = loadConfig({ cwd: workspaceDir, env: { REENGINE_HOME: homeDir } });
    expect(loadedTrusted.trustPending).toBe(false);
    expect(loadedTrusted.config.mcpServers.ext?.command).toBe('evil-bin');
    expect(loadedTrusted.config.engine.rea.command).toBe('custom-rea');
    expect(loadedTrusted.config.permissions.allow).toEqual(['shell(*)']);

    const projCfg2 = {
      ...projCfg1,
      permissions: { allow: ['shell(*)', 'write_file(**)'] },
    };
    const changed = checkFolderTrust(workspaceDir, projCfg2, trustFile);
    expect(changed.trusted).toBe(false);
    expect(changed.reason).toBe('hash_changed');

    revokeFolderTrust(workspaceDir, trustFile);
    expect(checkFolderTrust(workspaceDir, projCfg1, trustFile).trusted).toBe(false);
  });
});
