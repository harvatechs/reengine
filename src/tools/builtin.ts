import * as fs from 'node:fs';
import * as path from 'node:path';
import AjvModule from 'ajv';
import addFormatsModule from 'ajv-formats';
import type { Tool, ToolOutput } from '../core/contracts.js';

const ARTIFACT_ID_RE = /^[0-9a-f]{64}$/;

export interface TodoItem {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
}

export function createUtilityTools(options: {
  artifactsDir: string;
  onTodoUpdate?: (items: TodoItem[]) => void;
}): Tool[] {
  const todoTool: Tool = {
    name: 'todo_write',
    description: 'Update the structured task checklist for the current analysis session.',
    inputSchema: {
      type: 'object',
      properties: {
        todos: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              content: { type: 'string' },
              status: { type: 'string', enum: ['pending', 'in_progress', 'completed'] },
            },
            required: ['id', 'content', 'status'],
            additionalProperties: false,
          },
        },
      },
      required: ['todos'],
      additionalProperties: false,
    },
    risk: 'read',
    readOnly: true,
    destructive: false,
    openWorld: false,
    pathArgs: [],
    source: { kind: 'builtin' },
    describe: (input) => {
      const len = Array.isArray((input as { todos?: unknown[] }).todos)
        ? (input as { todos: unknown[] }).todos.length
        : 0;
      return `todo_write(${String(len)} items)`;
    },
    execute: (input): Promise<ToolOutput> => {
      const { todos } = input as { todos: TodoItem[] };
      options.onTodoUpdate?.(todos);
      return Promise.resolve({ isError: false, content: `Updated ${String(todos.length)} todos.` });
    },
  };

  const artifactReadTool: Tool = {
    name: 'artifact_read',
    description: 'Read a slice of a spilled session artifact by its 64-char SHA-256 id.',
    inputSchema: {
      type: 'object',
      properties: {
        artifactId: { type: 'string', pattern: '^[0-9a-f]{64}$' },
        offsetChars: { type: 'integer', minimum: 0 },
        limitChars: { type: 'integer', minimum: 1, maximum: 50000 },
      },
      required: ['artifactId'],
      additionalProperties: false,
    },
    risk: 'read',
    readOnly: true,
    destructive: false,
    openWorld: false,
    pathArgs: [],
    source: { kind: 'builtin' },
    describe: (input) =>
      `artifact_read(${((input as { artifactId?: string }).artifactId ?? '').slice(0, 12)})`,
    execute: (input): Promise<ToolOutput> => {
      const {
        artifactId,
        offsetChars = 0,
        limitChars = 8000,
      } = input as {
        artifactId: string;
        offsetChars?: number;
        limitChars?: number;
      };
      if (!ARTIFACT_ID_RE.test(artifactId)) {
        return Promise.resolve({ isError: true, content: `Invalid artifact id: ${artifactId}` });
      }
      const target = path.join(options.artifactsDir, artifactId);
      if (!fs.existsSync(target)) {
        return Promise.resolve({ isError: true, content: `Artifact not found: ${artifactId}` });
      }
      const raw = fs.readFileSync(target, 'utf-8');
      const slice = raw.slice(offsetChars, offsetChars + limitChars);
      return Promise.resolve({
        isError: false,
        content: `[artifact ${artifactId} chars ${String(offsetChars)}..${String(offsetChars + slice.length)} of ${String(raw.length)}]\n${slice}`,
      });
    },
  };

  const artifactSearchTool: Tool = {
    name: 'artifact_search',
    description: 'Search a spilled session artifact by substring or regex.',
    inputSchema: {
      type: 'object',
      properties: {
        artifactId: { type: 'string', pattern: '^[0-9a-f]{64}$' },
        pattern: { type: 'string' },
      },
      required: ['artifactId', 'pattern'],
      additionalProperties: false,
    },
    risk: 'read',
    readOnly: true,
    destructive: false,
    openWorld: false,
    pathArgs: [],
    source: { kind: 'builtin' },
    describe: (input) => `artifact_search(${(input as { pattern?: string }).pattern ?? ''})`,
    execute: (input): Promise<ToolOutput> => {
      const { artifactId, pattern } = input as { artifactId: string; pattern: string };
      if (!ARTIFACT_ID_RE.test(artifactId)) {
        return Promise.resolve({ isError: true, content: `Invalid artifact id: ${artifactId}` });
      }
      const target = path.join(options.artifactsDir, artifactId);
      if (!fs.existsSync(target)) {
        return Promise.resolve({ isError: true, content: `Artifact not found: ${artifactId}` });
      }
      const re = new RegExp(pattern);
      const lines = fs.readFileSync(target, 'utf-8').split(/\r?\n/);
      const hits: string[] = [];
      for (let i = 0; i < lines.length; i++) {
        if (re.test(lines[i] ?? '')) {
          hits.push(`${String(i + 1)}: ${lines[i] ?? ''}`);
          if (hits.length >= 200) break;
        }
      }
      return Promise.resolve({ isError: false, content: hits.join('\n') || '(no matches)' });
    },
  };

  return [todoTool, artifactReadTool, artifactSearchTool];
}

export function createAjvValidator(): (tool: Tool, args: unknown) => string | null {
  const AjvCtor = AjvModule as unknown as new (opts: { allErrors: boolean; strict: boolean }) => {
    compile: (schema: Record<string, unknown>) => {
      (data: unknown): boolean;
      errors?: Array<{ instancePath?: string; message?: string }>;
    };
  };
  const ajv = new AjvCtor({ allErrors: true, strict: false });
  const addFormats = addFormatsModule as unknown as (instance: unknown) => void;
  addFormats(ajv);
  const cache = new Map<string, ReturnType<typeof ajv.compile>>();

  return (tool: Tool, args: unknown): string | null => {
    let validate = cache.get(tool.name);
    if (!validate) {
      validate = ajv.compile(tool.inputSchema);
      cache.set(tool.name, validate);
    }
    const valid = validate(args);
    if (valid) return null;
    return (validate.errors ?? [])
      .map((e) => `${e.instancePath || '/'} ${e.message ?? 'invalid'}`)
      .join('; ');
  };
}
