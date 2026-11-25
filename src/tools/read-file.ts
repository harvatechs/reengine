import * as fs from 'node:fs';
import * as path from 'node:path';
import fg from 'fast-glob';
import ignoreFactory from 'ignore';
import type { Tool, ToolContext, ToolOutput } from '../core/contracts.js';
import { resolveSafeWorkspacePath } from './path-guard.js';

function loadIgnoreFilter(workspaceRoot: string): ReturnType<typeof ignoreFactory> {
  const ig = ignoreFactory();
  ig.add(['.git/**', 'node_modules/**']);
  const gitignorePath = path.join(workspaceRoot, '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    ig.add(fs.readFileSync(gitignorePath, 'utf-8'));
  }
  return ig;
}

function isBinaryBuffer(buf: Buffer): boolean {
  const limit = Math.min(buf.length, 8192);
  for (let i = 0; i < limit; i++) {
    if (buf[i] === 0) return true;
  }
  return false;
}

function isSafeRegex(pattern: string): boolean {
  if (pattern.length > 200) return false;
  if (/(\+|\*|\{[^}]+\})\s*(\+|\*|\?|\{)/.test(pattern)) return false;
  return true;
}

export function createReadTools(options: {
  additionalDirs: string[];
  maxReadBytes?: number;
  maxGrepMatches?: number;
}): Tool[] {
  const maxReadBytes = options.maxReadBytes ?? 2_097_152;
  const maxGrepMatches = options.maxGrepMatches ?? 500;

  const readFileTool: Tool = {
    name: 'read_file',
    description: 'Read a UTF-8 text file within workspace roots with optional line range.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        offset: { type: 'integer', minimum: 1 },
        limit: { type: 'integer', minimum: 1 },
      },
      required: ['path'],
      additionalProperties: false,
    },
    risk: 'read',
    readOnly: true,
    destructive: false,
    openWorld: false,
    pathArgs: ['path'],
    source: { kind: 'builtin' },
    describe: (input) => `read_file(${(input as { path?: string }).path ?? ''})`,
    execute: (input, ctx: ToolContext): Promise<ToolOutput> => {
      const {
        path: filePath,
        offset = 1,
        limit = 500,
      } = input as {
        path: string;
        offset?: number;
        limit?: number;
      };
      const safePath = resolveSafeWorkspacePath(
        filePath,
        ctx.workspaceRoot,
        options.additionalDirs,
      );
      const stat = fs.statSync(safePath);
      if (stat.isDirectory()) {
        return Promise.resolve({ isError: true, content: `Path is a directory: ${filePath}` });
      }
      if (stat.size > maxReadBytes) {
        return Promise.resolve({
          isError: true,
          content: `File exceeds maxReadBytes (${String(stat.size)} > ${String(maxReadBytes)}). Use offset/limit or REA.`,
        });
      }
      const buf = fs.readFileSync(safePath);
      if (isBinaryBuffer(buf)) {
        return Promise.resolve({
          isError: true,
          content: `File "${filePath}" appears to be binary. Use REA engine tools to inspect binaries.`,
        });
      }
      const lines = buf.toString('utf-8').split(/\r?\n/);
      const startIdx = Math.max(0, offset - 1);
      const slice = lines.slice(startIdx, startIdx + limit);
      const numbered = slice.map((l, idx) => `${String(startIdx + idx + 1)}: ${l}`).join('\n');
      return Promise.resolve({ isError: false, content: numbered });
    },
  };

  const listDirTool: Tool = {
    name: 'list_dir',
    description: 'List files and directories inside a workspace directory.',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path'],
      additionalProperties: false,
    },
    risk: 'read',
    readOnly: true,
    destructive: false,
    openWorld: false,
    pathArgs: ['path'],
    source: { kind: 'builtin' },
    describe: (input) => `list_dir(${(input as { path?: string }).path ?? '.'})`,
    execute: (input, ctx: ToolContext): Promise<ToolOutput> => {
      const { path: dirPath } = input as { path: string };
      const safePath = resolveSafeWorkspacePath(dirPath, ctx.workspaceRoot, options.additionalDirs);
      const entries = fs
        .readdirSync(safePath, { withFileTypes: true })
        .slice(0, 500)
        .map((e) => `${e.isDirectory() ? '[dir] ' : '[file]'} ${e.name}`);
      return Promise.resolve({
        isError: false,
        content: entries.join('\n') || '(empty directory)',
      });
    },
  };

  const globTool: Tool = {
    name: 'glob',
    description: 'Find workspace files matching a glob pattern (respects .gitignore).',
    inputSchema: {
      type: 'object',
      properties: {
        pattern: { type: 'string' },
        cwd: { type: 'string' },
      },
      required: ['pattern'],
      additionalProperties: false,
    },
    risk: 'read',
    readOnly: true,
    destructive: false,
    openWorld: false,
    pathArgs: ['cwd'],
    source: { kind: 'builtin' },
    describe: (input) => `glob(${(input as { pattern?: string }).pattern ?? ''})`,
    execute: async (input, ctx: ToolContext): Promise<ToolOutput> => {
      const { pattern, cwd: subCwd = '.' } = input as { pattern: string; cwd?: string };
      const safeDir = resolveSafeWorkspacePath(subCwd, ctx.workspaceRoot, options.additionalDirs);
      const ig = loadIgnoreFilter(ctx.workspaceRoot);
      const matches = await fg(pattern, { cwd: safeDir, dot: false, onlyFiles: true });
      const filtered = matches.filter((m) => !ig.ignores(m)).slice(0, 500);
      return { isError: false, content: filtered.join('\n') || '(no matches)' };
    },
  };

  const grepTool: Tool = {
    name: 'grep',
    description: 'Search text files in workspace using a safe regular expression.',
    inputSchema: {
      type: 'object',
      properties: {
        pattern: { type: 'string' },
        path: { type: 'string' },
      },
      required: ['pattern'],
      additionalProperties: false,
    },
    risk: 'read',
    readOnly: true,
    destructive: false,
    openWorld: false,
    pathArgs: ['path'],
    source: { kind: 'builtin' },
    describe: (input) => `grep(${(input as { pattern?: string }).pattern ?? ''})`,
    execute: async (input, ctx: ToolContext): Promise<ToolOutput> => {
      const { pattern, path: target = '.' } = input as { pattern: string; path?: string };
      if (!isSafeRegex(pattern)) {
        return { isError: true, content: 'Regex rejected: too long or potentially catastrophic.' };
      }
      const re = new RegExp(pattern);
      const safePath = resolveSafeWorkspacePath(target, ctx.workspaceRoot, options.additionalDirs);
      const ig = loadIgnoreFilter(ctx.workspaceRoot);
      const isDir = fs.statSync(safePath).isDirectory();
      const files = isDir
        ? (await fg('**/*', { cwd: safePath, onlyFiles: true })).filter((f) => !ig.ignores(f))
        : [path.basename(safePath)];
      const baseDir = isDir ? safePath : path.dirname(safePath);
      const hits = collectGrepHits(baseDir, files, re, maxReadBytes, maxGrepMatches, ctx.signal);
      return { isError: false, content: hits.join('\n') || '(no matches)' };
    },
  };

  return [readFileTool, listDirTool, globTool, grepTool];
}

function collectGrepHits(
  baseDir: string,
  files: string[],
  re: RegExp,
  maxReadBytes: number,
  maxMatches: number,
  signal: AbortSignal,
): string[] {
  const hits: string[] = [];
  for (const rel of files) {
    if (hits.length >= maxMatches || signal.aborted) break;
    const full = path.join(baseDir, rel);
    if (fs.statSync(full).size > maxReadBytes) continue;
    const buf = fs.readFileSync(full);
    if (isBinaryBuffer(buf)) continue;
    const lines = buf.toString('utf-8').split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (re.test(lines[i] ?? '')) {
        hits.push(`${rel}:${String(i + 1)}: ${lines[i] ?? ''}`);
        if (hits.length >= maxMatches) break;
      }
    }
  }
  return hits;
}
