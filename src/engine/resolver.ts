import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { EngineError } from '../util/index.js';
import { REA_CONTRACT } from './contract.js';

export interface ResolvedReaCommand {
  command: string;
  args: string[];
  source: 'config' | 'bundled' | 'path' | 'npx';
  version?: string;
}

export interface ReaResolveOptions {
  configCommand?: string | undefined;
  configArgs?: string[] | undefined;
  allowNpx?: boolean | undefined;
}

function tryReadVersion(bin: string, prefixArgs: string[]): string | undefined {
  try {
    const out = execFileSync(bin, [...prefixArgs, '--version'], {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    const match = /(\d+\.\d+\.\d+)/.exec(out);
    return match?.[1];
  } catch {
    return undefined;
  }
}

export function resolveReaBinary(options: ReaResolveOptions = {}): ResolvedReaCommand {
  if (options.configCommand) {
    return {
      command: options.configCommand,
      args: options.configArgs ?? ['--mcp'],
      source: 'config',
    };
  }

  try {
    const req = createRequire(import.meta.url);
    const pkgJsonPath = req.resolve('rea-agents/package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8')) as {
      version?: string;
      bin?: string | Record<string, string>;
    };
    const binRel = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.rea;
    if (binRel) {
      const absBin = path.resolve(path.dirname(pkgJsonPath), binRel);
      if (fs.existsSync(absBin)) {
        return {
          command: process.execPath,
          args: [absBin, '--mcp'],
          source: 'bundled',
          ...(pkg.version ? { version: pkg.version } : {}),
        };
      }
    }
  } catch {
    // Fall through to PATH / npx
  }

  const pathBin = process.platform === 'win32' ? 'rea.cmd' : 'rea';
  const ver = tryReadVersion(pathBin, []);
  if (ver) {
    return { command: pathBin, args: ['--mcp'], source: 'path', version: ver };
  }

  if (options.allowNpx) {
    const npxBin = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    return {
      command: npxBin,
      args: ['-y', `rea-agents@${REA_CONTRACT.pinnedVersion}`, '--mcp'],
      source: 'npx',
      version: REA_CONTRACT.pinnedVersion,
    };
  }

  throw new EngineError(
    'ENGINE_UNAVAILABLE',
    'Could not resolve REA engine binary (config, bundled rea-agents, or PATH).',
    { remedy: 'Install rea-agents or set engine.rea.command / engine.rea.allowNpx=true.' },
  );
}
