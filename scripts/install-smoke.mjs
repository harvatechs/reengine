import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const root = process.cwd();
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reengine-install-smoke-'));
const homeDir = path.join(tmpDir, 'home');
fs.mkdirSync(homeDir, { recursive: true });

try {
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const packOut = execFileSync(
    npmCmd,
    ['pack', '--ignore-scripts', '--pack-destination', tmpDir, '--json'],
    { cwd: root, encoding: 'utf-8', shell: process.platform === 'win32' },
  );
  const parsed = JSON.parse(packOut);
  const tgz = Array.isArray(parsed) ? parsed[0]?.filename : Object.keys(parsed)[0];
  if (!tgz) {
    throw new Error('npm pack did not produce a tarball');
  }
  const tarballPath = path.join(tmpDir, tgz);
  const binScript = path.join(root, 'bin/reengine.js');

  const verOut = execFileSync(process.execPath, [binScript, 'version'], {
    cwd: tmpDir,
    env: { ...process.env, REENGINE_HOME: homeDir },
    encoding: 'utf-8',
  });
  if (!verOut.includes('reengine-cli')) {
    throw new Error(`Unexpected version output: ${verOut}`);
  }

  const cfgOut = execFileSync(process.execPath, [binScript, 'config', 'list'], {
    cwd: tmpDir,
    env: { ...process.env, REENGINE_HOME: homeDir },
    encoding: 'utf-8',
  });
  if (!cfgOut.includes('"version": 1')) {
    throw new Error(`Unexpected config list output: ${cfgOut}`);
  }

  process.stdout.write(`install-smoke OK (${path.basename(tarballPath)})\n`);
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
