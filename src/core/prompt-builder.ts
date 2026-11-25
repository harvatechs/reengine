import * as fs from 'node:fs';
import * as path from 'node:path';
import sea from 'node:sea';
import { fileURLToPath } from 'node:url';
import type { PermissionMode } from './contracts.js';

export interface PromptBuildInput {
  os: string;
  shell: string;
  cwd: string;
  date: string;
  model: string;
  permissionMode: PermissionMode;
  targets: string[];
  engineStatus: string;
  memoryText?: string;
}

function resolvePromptDir(): string {
  const here =
    typeof import.meta.url === 'string' && import.meta.url
      ? path.dirname(fileURLToPath(import.meta.url))
      : path.dirname(process.execPath);
  const candidates = [
    path.resolve(here, 'prompt'),
    path.resolve(here, '../src/core/prompt'),
    path.resolve(here, '../../src/core/prompt'),
    path.resolve(process.cwd(), 'src/core/prompt'),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'identity.md'))) {
      return dir;
    }
  }
  return path.resolve(process.cwd(), 'src/core/prompt');
}

function readPromptModule(promptDir: string, name: string): string {
  if (sea.isSea()) {
    try {
      return sea.getAsset(`prompt/${name}`, 'utf8').trim();
    } catch {
      // fall back to filesystem
    }
  }
  return fs.readFileSync(path.join(promptDir, name), 'utf-8').trim();
}

function fillPlaceholders(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => vars[key] ?? '');
}

export function loadMemoryFiles(
  cwd: string,
  userConfigDir: string,
  fileNames: readonly string[],
  maxBytes: number,
): { text: string; truncated: boolean } {
  const chunks: string[] = [];
  for (const name of fileNames) {
    const userFile = path.join(userConfigDir, name);
    if (fs.existsSync(userFile)) {
      chunks.push(`## ${userFile}\n${fs.readFileSync(userFile, 'utf-8').trim()}`);
    }
  }
  const dirs: string[] = [];
  let cur = path.resolve(cwd);
  for (;;) {
    dirs.push(cur);
    const parent = path.dirname(cur);
    if (parent === cur || fs.existsSync(path.join(cur, '.git'))) break;
    cur = parent;
  }
  for (const dir of dirs.reverse()) {
    for (const name of fileNames) {
      const candidate = path.join(dir, name);
      if (fs.existsSync(candidate)) {
        chunks.push(`## ${candidate}\n${fs.readFileSync(candidate, 'utf-8').trim()}`);
      }
    }
  }
  const combined = chunks.join('\n\n');
  const buf = Buffer.from(combined, 'utf-8');
  if (buf.byteLength <= maxBytes) {
    return { text: combined, truncated: false };
  }
  const sliced = buf.subarray(0, maxBytes).toString('utf-8');
  return { text: `${sliced}\n\n[memory truncated at ${String(maxBytes)} bytes]`, truncated: true };
}

export function buildSystemPrompt(input: PromptBuildInput): string {
  const promptDir = resolvePromptDir();
  const vars: Record<string, string> = {
    os: input.os,
    shell: input.shell,
    cwd: input.cwd,
    date: input.date,
    model: input.model,
    permissionMode: input.permissionMode,
    targets: input.targets.length > 0 ? input.targets.join(', ') : '(none)',
    engineStatus: input.engineStatus,
    memory: input.memoryText ?? '',
  };

  const modules = [
    readPromptModule(promptDir, 'identity.md'),
    readPromptModule(promptDir, 'evidence.md'),
    readPromptModule(promptDir, 'rea-workflow.md'),
    readPromptModule(promptDir, 'tools.md'),
    readPromptModule(promptDir, 'safety.md'),
    fillPlaceholders(readPromptModule(promptDir, 'environment.md'), vars),
  ];

  if (input.memoryText && input.memoryText.trim().length > 0) {
    modules.push(fillPlaceholders(readPromptModule(promptDir, 'memory.md'), vars));
  }
  if (input.permissionMode === 'plan') {
    modules.push(readPromptModule(promptDir, 'mode-plan.md'));
  }

  return modules.join('\n\n');
}

export function getCompactionPrompt(): string {
  return readPromptModule(resolvePromptDir(), 'compaction.md');
}

export function wrapUntrustedToolOutput(toolName: string, content: string): string {
  const safe = content.replace(/<\/untrusted_tool_output>/gi, '</untrusted_tool\u200D_output>');
  return `<untrusted_tool_output tool="${toolName}">\n${safe}\n</untrusted_tool_output>`;
}
