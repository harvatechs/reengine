import * as fs from 'node:fs';
import { loadConfig } from '../config/index.js';
import { getEngineDoctor } from './engine-service.js';
import { detectTerminalCapabilities, resolveRuntimePaths } from '../platform/index.js';

export interface DoctorCheck {
  id: string;
  status: 'pass' | 'warn' | 'fail' | 'skip';
  message: string;
  remedy?: string;
}

async function checkEngineAndAdd(cwd: string, checks: DoctorCheck[]): Promise<void> {
  try {
    const eng = await getEngineDoctor(cwd);
    checks.push({
      id: 'engine:resolved',
      status: 'pass',
      message: `${eng.source} (${eng.version ?? 'unknown'})`,
    });
  } catch (e) {
    checks.push({
      id: 'engine:resolved',
      status: 'fail',
      message: e instanceof Error ? e.message : String(e),
      remedy: 'Ensure rea-agents is installed or set engine.rea.command.',
    });
  }
}

export async function runFullDoctor(cwd = process.cwd()): Promise<{
  ok: boolean;
  checks: DoctorCheck[];
}> {
  const checks: DoctorCheck[] = [];
  const major = Number.parseInt(process.version.slice(1).split('.')[0] ?? '0', 10);
  checks.push({
    id: 'node-version',
    status: major >= 22 ? 'pass' : 'fail',
    message: `Node.js ${process.version}`,
    ...(major < 22 ? { remedy: 'Upgrade to Node.js 22 LTS or 24 LTS.' } : {}),
  });

  checks.push({
    id: 'platform',
    status: 'pass',
    message: `${process.platform}/${process.arch}`,
  });

  const term = detectTerminalCapabilities();
  checks.push({
    id: 'terminal',
    status: 'pass',
    message: `emulator=${term.emulator}, color=${term.colorDepth}, unicode=${String(term.unicode)}, ${String(term.columns)}x${String(term.rows)}`,
  });

  const paths = resolveRuntimePaths();
  try {
    fs.mkdirSync(paths.stateDir, { recursive: true });
    checks.push({ id: 'paths-writable', status: 'pass', message: paths.stateDir });
  } catch (e) {
    checks.push({
      id: 'paths-writable',
      status: 'fail',
      message: e instanceof Error ? e.message : String(e),
    });
  }

  let configValid = false;
  try {
    const loaded = loadConfig({ cwd });
    configValid = true;
    checks.push({
      id: 'config-valid',
      status: 'pass',
      message: loaded.userConfigPath ?? 'using defaults',
    });
    checks.push({
      id: 'trust-state',
      status: loaded.trustPending ? 'warn' : 'pass',
      message: loaded.trustPending ? 'Project trust pending' : 'Trusted or no project config',
    });
  } catch (e) {
    checks.push({
      id: 'config-valid',
      status: 'fail',
      message: e instanceof Error ? e.message : String(e),
    });
  }

  if (configValid) {
    await checkEngineAndAdd(cwd, checks);
  }

  return { ok: !checks.some((c) => c.status === 'fail'), checks };
}
