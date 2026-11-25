import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import sea from 'node:sea';
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
      shell: process.platform === 'win32' && bin.toLowerCase().endsWith('.cmd'),
    }).trim();
    const match = /(\d+\.\d+\.\d+)/.exec(out);
    return match?.[1];
  } catch {
    return undefined;
  }
}

function resolveReaFromPackageJson(
  pkgJsonPath: string,
  source: 'bundled' | 'path',
): ResolvedReaCommand | null {
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8')) as {
      version?: string;
      bin?: string | Record<string, string>;
    };
    const binRel = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.rea;
    if (!binRel) return null;
    const absBin = path.resolve(path.dirname(pkgJsonPath), binRel);
    if (!fs.existsSync(absBin)) return null;
    return {
      command: sea.isSea() ? 'node' : process.execPath,
      args: [absBin, '--mcp'],
      source,
      ...(pkg.version ? { version: pkg.version } : {}),
    };
  } catch {
    return null;
  }
}

function resolveBundledRea(): ResolvedReaCommand | null {
  try {
    const metaUrl =
      typeof import.meta.url === 'string' && import.meta.url
        ? import.meta.url
        : path.join(process.cwd(), 'package.json');
    const req = createRequire(metaUrl);
    return resolveReaFromPackageJson(req.resolve('rea-agents/package.json'), 'bundled');
  } catch {
    return null;
  }
}

function resolvePathRea(): ResolvedReaCommand | null {
  const pathBin = process.platform === 'win32' ? 'rea.cmd' : 'rea';
  const ver = tryReadVersion(pathBin, []);
  if (!ver) return null;
  if (process.platform === 'win32') {
    for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
      if (!dir) continue;
      if (fs.existsSync(path.join(dir, 'rea.cmd'))) {
        const pkgPath = path.join(dir, 'node_modules/rea-agents/package.json');
        const resolved = resolveReaFromPackageJson(pkgPath, 'path');
        if (resolved) return resolved;
      }
    }
  }
  return { command: pathBin, args: ['--mcp'], source: 'path', version: ver };
}

export function resolveReaBinary(options: ReaResolveOptions = {}): ResolvedReaCommand {
  if (options.configCommand) {
    return {
      command: options.configCommand,
      args: options.configArgs ?? ['--mcp'],
      source: 'config',
    };
  }

  const bundled = resolveBundledRea();
  if (bundled) return bundled;

  const fromPath = resolvePathRea();
  if (fromPath) return fromPath;

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
