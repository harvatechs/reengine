import * as fs from 'node:fs';
import * as path from 'node:path';
import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { runCli } from '../../../src/cli/main.js';

describe('Lazy-load & bundle hygiene (P7-02)', () => {
  it('runs --version and config path without importing ink in main CLI chunk', async () => {
    const mainSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/cli/main.ts'), 'utf-8');
    expect(mainSrc).not.toMatch(/from ['"]ink['"]/);
    expect(mainSrc).not.toMatch(/from ['"]react['"]/);

    const out = new PassThrough();
    const err = new PassThrough();
    const chunks: string[] = [];
    out.on('data', (c: Buffer) => chunks.push(c.toString('utf-8')));

    const t0 = performance.now();
    const code = await runCli(['node', 'reengine', 'version'], { stdout: out, stderr: err });
    const elapsedMs = performance.now() - t0;

    expect(code).toBe(0);
    expect(chunks.join('')).toContain('reengine-cli');
    expect(elapsedMs).toBeLessThan(1500);
  });
});
