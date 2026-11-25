import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ALLOWED_TOP_LEVEL = new Set([
  'dist',
  'bin',
  'schemas',
  'package.json',
  'README.md',
  'LICENSE',
  'THIRD_PARTY_NOTICES.md',
  'CHANGELOG.md',
]);

const distCli = path.resolve(process.cwd(), 'dist/cli.js');
if (!fs.existsSync(distCli)) {
  throw new Error('dist/cli.js missing — run npm run build first');
}

interface PackEntry {
  files?: Array<{ path: string; size: number }>;
  unpackedSize?: number;
}

const raw = execSync('npm pack --dry-run --json --ignore-scripts', { encoding: 'utf-8' });
const parsed = JSON.parse(raw) as PackEntry[] | Record<string, PackEntry>;
const pack: PackEntry | undefined = Array.isArray(parsed) ? parsed[0] : Object.values(parsed)[0];

if (!pack?.files) {
  throw new Error('Unexpected npm pack --dry-run --json output');
}

for (const file of pack.files) {
  const top = file.path.split('/')[0] ?? '';
  if (!ALLOWED_TOP_LEVEL.has(top)) {
    throw new Error(`Disallowed file in tarball: ${file.path} (R-074)`);
  }
}

const MAX_BYTES = 25 * 1024 * 1024;
if ((pack.unpackedSize ?? 0) > MAX_BYTES) {
  throw new Error(`Unpacked tarball size ${pack.unpackedSize} exceeds 25 MB budget (NFR-DIST-01)`);
}

process.stdout.write(
  `pack:check OK (${pack.files.length} files, ${pack.unpackedSize ?? 0} bytes unpacked)\n`,
);
