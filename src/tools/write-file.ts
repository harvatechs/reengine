import * as fs from 'node:fs';
import * as path from 'node:path';
import { createTwoFilesPatch } from 'diff';
import type { Tool, ToolContext, ToolOutput } from '../core/contracts.js';
import { resolveSafeWorkspacePath } from './path-guard.js';

const MAX_EDIT_BYTES = 2_097_152;

function atomicWriteFile(filePath: string, content: string, mode?: number): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = path.join(
    path.dirname(filePath),
    `.tmp-${path.basename(filePath)}-${String(process.pid)}`,
  );
  fs.writeFileSync(tmp, content, { encoding: 'utf-8', ...(mode !== undefined ? { mode } : {}) });
  fs.renameSync(tmp, filePath);
}

export function createWriteTools(options: { additionalDirs: string[] }): Tool[] {
  const writeFileTool: Tool = {
    name: 'write_file',
    description: 'Create or overwrite a UTF-8 text file within workspace roots.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        content: { type: 'string' },
      },
      required: ['path', 'content'],
      additionalProperties: false,
    },
    risk: 'write',
    readOnly: false,
    destructive: true,
    openWorld: false,
    pathArgs: ['path'],
    source: { kind: 'builtin' },
    describe: (input) => `write_file(${(input as { path?: string }).path ?? ''})`,
    execute: (input, ctx: ToolContext): Promise<ToolOutput> => {
      const { path: filePath, content } = input as { path: string; content: string };
      const safePath = resolveSafeWorkspacePath(
        filePath,
        ctx.workspaceRoot,
        options.additionalDirs,
      );
      const exists = fs.existsSync(safePath);
      const prev = exists ? fs.readFileSync(safePath, 'utf-8') : '';
      const mode = exists ? fs.statSync(safePath).mode : undefined;
      atomicWriteFile(safePath, content, mode);
      const patch = createTwoFilesPatch(filePath, filePath, prev, content);
      return Promise.resolve({ isError: false, content: patch });
    },
  };

  const editFileTool: Tool = {
    name: 'edit_file',
    description: 'Replace an exact unique string in an existing workspace text file.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        oldString: { type: 'string' },
        newString: { type: 'string' },
      },
      required: ['path', 'oldString', 'newString'],
      additionalProperties: false,
    },
    risk: 'write',
    readOnly: false,
    destructive: false,
    openWorld: false,
    pathArgs: ['path'],
    source: { kind: 'builtin' },
    describe: (input) => `edit_file(${(input as { path?: string }).path ?? ''})`,
    execute: (input, ctx: ToolContext): Promise<ToolOutput> => {
      const {
        path: filePath,
        oldString,
        newString,
      } = input as {
        path: string;
        oldString: string;
        newString: string;
      };
      const safePath = resolveSafeWorkspacePath(
        filePath,
        ctx.workspaceRoot,
        options.additionalDirs,
      );
      if (!fs.existsSync(safePath)) {
        return Promise.resolve({ isError: true, content: `File not found: ${filePath}` });
      }
      const stat = fs.statSync(safePath);
      if (stat.size > MAX_EDIT_BYTES) {
        return Promise.resolve({
          isError: true,
          content: `File exceeds 2 MB edit limit: ${filePath}`,
        });
      }
      const raw = fs.readFileSync(safePath, 'utf-8');
      const usesCrlf = raw.includes('\r\n');
      const normRaw = raw.replace(/\r\n/g, '\n');
      const normOld = oldString.replace(/\r\n/g, '\n');
      const normNew = newString.replace(/\r\n/g, '\n');

      const firstIdx = normRaw.indexOf(normOld);
      if (firstIdx === -1) {
        return Promise.resolve({ isError: true, content: `oldString not found in ${filePath}` });
      }
      if (normRaw.indexOf(normOld, firstIdx + normOld.length) !== -1) {
        return Promise.resolve({
          isError: true,
          content: `oldString matched multiple locations in ${filePath}; provide more context.`,
        });
      }
      const updatedNorm =
        normRaw.slice(0, firstIdx) + normNew + normRaw.slice(firstIdx + normOld.length);
      const finalContent = usesCrlf ? updatedNorm.replace(/\n/g, '\r\n') : updatedNorm;
      atomicWriteFile(safePath, finalContent, stat.mode);
      const patch = createTwoFilesPatch(filePath, filePath, normRaw, updatedNorm);
      return Promise.resolve({ isError: false, content: patch });
    },
  };

  return [writeFileTool, editFileTool];
}
