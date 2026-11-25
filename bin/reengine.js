#!/usr/bin/env node
const [major, minor] = process.versions.node.split('.').map(Number);
const supported = (major === 22 && minor >= 19) || (major === 24 && minor >= 11) || major >= 26;
if (!supported) {
  process.stderr.write(
    `ReEngine requires Node.js ^22.19.0 || ^24.11.0 || >=26 (found ${process.versions.node}).\n`,
  );
  process.exit(2);
}
await import('../dist/cli.js');
