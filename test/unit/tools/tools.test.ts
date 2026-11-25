import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createAjvValidator,
  createReadTools,
  createShellTool,
  createUtilityTools,
  createWriteTools,
  resolveSafeWorkspacePath,
} from '../../../src/tools/index.js';
import { ToolError } from '../../../src/util/index.js';

describe('src/tools (P3-05..P3-08)', () => {
  let tmpDir: string;
  let wsDir: string;
  let outsideDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reengine-tools-'));
    wsDir = path.join(tmpDir, 'ws');
    outsideDir = path.join(tmpDir, 'outside');
    fs.mkdirSync(wsDir, { recursive: true });
    fs.mkdirSync(outsideDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('blocks path traversal and device files via path-guard', () => {
    expect(() => resolveSafeWorkspacePath('../outside/secret.txt', wsDir, [])).toThrowError(
      ToolError,
    );
    expect(() => resolveSafeWorkspacePath('/dev/null', wsDir, [])).toThrowError(ToolError);
  });

  it('reads, globs, greps, writes, and edits files with Ajv validation', async () => {
    const readTools = createReadTools({ additionalDirs: [] });
    const writeTools = createWriteTools({ additionalDirs: [] });
    const writeTool = writeTools.find((t) => t.name === 'write_file');
    const editTool = writeTools.find((t) => t.name === 'edit_file');
    const readTool = readTools.find((t) => t.name === 'read_file');
    const grepTool = readTools.find((t) => t.name === 'grep');
    const globTool = readTools.find((t) => t.name === 'glob');
    expect(writeTool && editTool && readTool && grepTool && globTool).toBeTruthy();

    const ctx = {
      cwd: wsDir,
      workspaceRoot: wsDir,
      signal: new AbortController().signal,
      reportProgress: () => undefined,
    };

    const validator = createAjvValidator();
    if (!writeTool || !editTool || !readTool || !grepTool || !globTool) return;

    expect(validator(readTool, { path: 123 })).toContain('string');
    expect(validator(readTool, { path: 'a.txt' })).toBeNull();

    const wRes = await writeTool.execute({ path: 'src/app.ts', content: 'const x = 1;\n' }, ctx);
    expect(wRes.isError).toBe(false);

    const eRes = await editTool.execute(
      { path: 'src/app.ts', oldString: 'const x = 1;', newString: 'const x = 2;' },
      ctx,
    );
    expect(eRes.isError).toBe(false);
    expect(eRes.content).toContain('-const x = 1;');
    expect(eRes.content).toContain('+const x = 2;');

    const rRes = await readTool.execute({ path: 'src/app.ts' }, ctx);
    expect(rRes.content).toContain('1: const x = 2;');

    const gRes = await globTool.execute({ pattern: '**/*.ts' }, ctx);
    expect(gRes.content).toContain('src/app.ts');

    const grRes = await grepTool.execute({ pattern: 'const x = 2' }, ctx);
    expect(grRes.content).toContain('src/app.ts:1:');
  });

  it('runs shell with scrubbed env and reads/searches artifacts', async () => {
    const prevKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = 'sk-should-be-scrubbed';
    try {
      const shellTool = createShellTool({ timeoutMs: 5000 });
      const ctx = {
        cwd: wsDir,
        workspaceRoot: wsDir,
        signal: new AbortController().signal,
        reportProgress: () => undefined,
      };
      const cmd =
        process.platform === 'win32'
          ? 'node -e "console.log(process.env.OPENAI_API_KEY || \'NONE\')"'
          : 'printf "%s" "${OPENAI_API_KEY:-NONE}"';
      const out = await shellTool.execute({ command: cmd }, ctx);
      expect(out.isError).toBe(false);
      expect(out.content).toContain('NONE');
      expect(out.content).not.toContain('sk-should-be-scrubbed');
    } finally {
      if (prevKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = prevKey;
    }

    const artDir = path.join(tmpDir, 'artifacts');
    fs.mkdirSync(artDir, { recursive: true });
    const fakeId = 'b'.repeat(64);
    fs.writeFileSync(path.join(artDir, fakeId), 'line1\nmatch_here\nline3', 'utf-8');
    const utilTools = createUtilityTools({ artifactsDir: artDir });
    const artRead = utilTools.find((t) => t.name === 'artifact_read');
    const artSearch = utilTools.find((t) => t.name === 'artifact_search');
    const ctx = {
      cwd: wsDir,
      workspaceRoot: wsDir,
      signal: new AbortController().signal,
      reportProgress: () => undefined,
    };
    const r = await artRead?.execute({ artifactId: fakeId }, ctx);
    expect(r?.content).toContain('match_here');
    const s = await artSearch?.execute({ artifactId: fakeId, pattern: 'match_here' }, ctx);
    expect(s?.content).toContain('2: match_here');
  });
});
