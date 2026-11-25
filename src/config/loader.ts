import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  applyEdits,
  findNodeAtLocation,
  getNodeValue,
  modify,
  parseTree,
  printParseErrorCode,
  type Node as JsoncNode,
  type ParseError,
} from 'jsonc-parser';
import type { ZodIssue } from 'zod';
import { resolveRuntimePaths } from '../platform/index.js';
import { ConfigError } from '../util/index.js';
import { ConfigSchema, type ReengineConfig } from './schema.js';
import { isSecretReference, maskSecretForDisplay } from './secrets.js';
import { checkFolderTrust } from './trust.js';

interface ConfigWarning {
  code: string;
  message: string;
}

export interface LoadedConfigResult {
  config: ReengineConfig;
  userConfigPath: string | null;
  projectConfigPath: string | null;
  trustPending: boolean;
  warnings: ConfigWarning[];
}

export interface LoadConfigOptions {
  cwd?: string;
  configPath?: string;
  env?: NodeJS.ProcessEnv;
  cliOverrides?: Record<string, unknown>;
}

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

function offsetToLineCol(text: string, offset: number): { line: number; col: number } {
  const slice = text.slice(0, offset);
  const lines = slice.split('\n');
  const last = lines[lines.length - 1] ?? '';
  return { line: lines.length, col: last.length + 1 };
}

function formatZodIssue(
  issue: ZodIssue,
  tree: JsoncNode | undefined,
  rawText: string,
  filePath: string,
): string {
  const pathStr = issue.path.length > 0 ? `config.${issue.path.join('.')}` : 'config';
  if (tree) {
    const node = findNodeAtLocation(tree, issue.path);
    if (node) {
      const { line, col } = offsetToLineCol(rawText, node.offset);
      return `${pathStr}: ${issue.message} (file: ${filePath}:${String(line)}:${String(col)})`;
    }
  }
  return `${pathStr}: ${issue.message} (file: ${filePath})`;
}

function parseJsoncFile(filePath: string): {
  data: Record<string, unknown>;
  tree: JsoncNode | undefined;
  rawText: string;
} {
  const rawText = fs.readFileSync(filePath, 'utf-8');
  const errors: ParseError[] = [];
  const tree = parseTree(rawText, errors, { allowTrailingComma: true });
  if (errors.length > 0) {
    const first = errors[0];
    if (first) {
      const { line, col } = offsetToLineCol(rawText, first.offset);
      throw new ConfigError(
        'CONFIG_SYNTAX',
        `JSONC syntax error (${printParseErrorCode(first.error)}) at ${filePath}:${String(line)}:${String(col)}`,
      );
    }
  }
  const value: unknown = tree ? getNodeValue(tree) : {};
  if (!isPlainObject(value)) {
    throw new ConfigError('CONFIG_INVALID', `Config root must be an object (file: ${filePath})`);
  }
  return { data: value, tree, rawText };
}

function migrateConfigInMemory(raw: Record<string, unknown>): {
  migrated: Record<string, unknown>;
  didMigrate: boolean;
} {
  if (raw.version === 1) {
    return { migrated: raw, didMigrate: false };
  }
  const copy: Record<string, unknown> = { ...raw, version: 1 };
  return { migrated: copy, didMigrate: true };
}

function mergeConfigObjects(
  base: Record<string, unknown>,
  overlay: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [key, val] of Object.entries(overlay)) {
    if (val === undefined) {
      continue;
    }
    const existing = out[key];
    if (isPlainObject(existing) && isPlainObject(val)) {
      if (key === 'permissions') {
        out[key] = mergePermissions(existing, val);
      } else {
        out[key] = mergeConfigObjects(existing, val);
      }
    } else {
      out[key] = val;
    }
  }
  return out;
}

function mergePermissions(
  base: Record<string, unknown>,
  overlay: Record<string, unknown>,
): Record<string, unknown> {
  const out = mergeConfigObjects(base, overlay);
  for (const ruleKey of ['allow', 'ask', 'deny'] as const) {
    const baseArr = Array.isArray(base[ruleKey]) ? (base[ruleKey] as unknown[]) : [];
    const overArr = Array.isArray(overlay[ruleKey]) ? (overlay[ruleKey] as unknown[]) : [];
    if (baseArr.length > 0 || overArr.length > 0) {
      out[ruleKey] = [...baseArr, ...overArr];
    }
  }
  return out;
}

function sanitizeProjectConfig(
  rawProject: Record<string, unknown>,
  trusted: boolean,
  warnings: ConfigWarning[],
): Record<string, unknown> {
  const clone = structuredClone(rawProject);
  checkProjectSecrets(clone);

  if (isPlainObject(clone.permissions) && clone.permissions.mode === 'bypass') {
    delete clone.permissions.mode;
    warnings.push({
      code: 'PROJECT_BYPASS_IGNORED',
      message: 'permissions.mode="bypass" in project config is ignored for security.',
    });
  }

  if (trusted) {
    return clone;
  }

  delete clone.mcpServers;
  if (isPlainObject(clone.engine) && isPlainObject(clone.engine.rea)) {
    delete clone.engine.rea.command;
    delete clone.engine.rea.args;
    delete clone.engine.rea.env;
  }
  if (isPlainObject(clone.permissions)) {
    delete clone.permissions.allow;
  }
  if (isPlainObject(clone.providers)) {
    for (const pVal of Object.values(clone.providers)) {
      if (isPlainObject(pVal)) {
        delete pVal.baseUrl;
        delete pVal.headers;
      }
    }
  }
  return clone;
}

function checkProjectSecrets(project: Record<string, unknown>): void {
  if (!isPlainObject(project.providers)) return;
  for (const [id, pVal] of Object.entries(project.providers)) {
    if (!isPlainObject(pVal) || !isPlainObject(pVal.auth)) continue;
    const key = pVal.auth.key;
    if (typeof key === 'string' && !isSecretReference(key)) {
      throw new ConfigError(
        'SECRET_LITERAL_FORBIDDEN',
        `config.providers.${id}.auth.key: Literal secrets are forbidden in project config; use env:, file:, or keychain:.`,
      );
    }
  }
}

function applyEnvOverlay(
  raw: Record<string, unknown>,
  env: NodeJS.ProcessEnv,
): Record<string, unknown> {
  const overlay: Record<string, unknown> = {};
  if (env.REENGINE_MODEL) {
    overlay.model = { default: env.REENGINE_MODEL };
  }
  if (env.REENGINE_THEME) {
    overlay.ui = { theme: env.REENGINE_THEME };
  }
  const permMode = env.REENGINE_PERMISSION_MODE;
  if (permMode === 'plan' || permMode === 'default' || permMode === 'acceptEdits') {
    overlay.permissions = { mode: permMode };
  }
  const logLevel = env.REENGINE_LOG_LEVEL;
  if (
    logLevel === 'error' ||
    logLevel === 'warn' ||
    logLevel === 'info' ||
    logLevel === 'debug' ||
    logLevel === 'trace'
  ) {
    overlay.logging = { level: logLevel };
  }
  if (env.REENGINE_NO_UPDATE_CHECK === '1') {
    overlay.updates = { check: false };
  }
  return mergeConfigObjects(raw, overlay);
}

function findConfigFile(dir: string): string | null {
  const jsonc = path.join(dir, 'config.jsonc');
  if (fs.existsSync(jsonc)) return jsonc;
  const json = path.join(dir, 'config.json');
  if (fs.existsSync(json)) return json;
  return null;
}

interface LayerParseMeta {
  tree: JsoncNode | undefined;
  rawText: string;
  filePath: string;
}

function loadUserLayer(
  userConfigPath: string | null,
  fallbackPath: string,
  warnings: ConfigWarning[],
): { data: Record<string, unknown>; meta: LayerParseMeta } {
  if (!userConfigPath || !fs.existsSync(userConfigPath)) {
    return { data: {}, meta: { tree: undefined, rawText: '', filePath: fallbackPath } };
  }
  const parsed = parseJsoncFile(userConfigPath);
  const { migrated, didMigrate } = migrateConfigInMemory(parsed.data);
  if (didMigrate) {
    warnings.push({
      code: 'CONFIG_MIGRATED',
      message: `Migrated ${userConfigPath} to version 1 in memory.`,
    });
  }
  return {
    data: migrated,
    meta: { tree: parsed.tree, rawText: parsed.rawText, filePath: userConfigPath },
  };
}

export function loadConfig(options: LoadConfigOptions = {}): LoadedConfigResult {
  const env = options.env ?? process.env;
  const cwd = options.cwd ?? process.cwd();
  const paths = resolveRuntimePaths(env);
  const warnings: ConfigWarning[] = [];

  const explicitPath = options.configPath ?? env.REENGINE_CONFIG;
  const userConfigPath = explicitPath
    ? path.resolve(explicitPath)
    : findConfigFile(paths.configDir);
  if (explicitPath && !fs.existsSync(explicitPath)) {
    throw new ConfigError('CONFIG_NOT_FOUND', `Config file not found: ${explicitPath}`);
  }

  const userLayer = loadUserLayer(userConfigPath, paths.configFile, warnings);
  let merged = mergeConfigObjects({ version: 1 }, userLayer.data);
  let lastMeta = userLayer.meta;

  const projectConfigPath = findConfigFile(path.join(cwd, '.reengine'));
  let trustPending = false;

  if (projectConfigPath) {
    const parsedProj = parseJsoncFile(projectConfigPath);
    const { migrated } = migrateConfigInMemory(parsedProj.data);
    const trust = checkFolderTrust(cwd, migrated, paths.trustFile);
    trustPending = !trust.trusted;
    merged = mergeConfigObjects(merged, sanitizeProjectConfig(migrated, trust.trusted, warnings));
    lastMeta = { tree: parsedProj.tree, rawText: parsedProj.rawText, filePath: projectConfigPath };
  }

  merged = applyEnvOverlay(merged, env);
  if (options.cliOverrides) {
    merged = mergeConfigObjects(merged, options.cliOverrides);
  }

  const validated = ConfigSchema.safeParse(merged);
  if (!validated.success) {
    const details = validated.error.issues
      .map((issue) => formatZodIssue(issue, lastMeta.tree, lastMeta.rawText, lastMeta.filePath))
      .join('; ');
    throw new ConfigError('CONFIG_INVALID', details);
  }

  return {
    config: validated.data,
    userConfigPath: userConfigPath && fs.existsSync(userConfigPath) ? userConfigPath : null,
    projectConfigPath,
    trustPending,
    warnings,
  };
}

export function writeConfigEdit(
  filePath: string,
  jsonPath: Array<string | number>,
  value: unknown,
): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  let text = fs.existsSync(filePath)
    ? fs.readFileSync(filePath, 'utf-8')
    : '{\n  "version": 1\n}\n';
  if (fs.existsSync(filePath)) {
    const parsed = parseJsoncFile(filePath);
    if (parsed.data.version !== 1) {
      fs.copyFileSync(filePath, `${filePath}.bak`);
      const verEdits = modify(text, ['version'], 1, {
        formattingOptions: { tabSize: 2, insertSpaces: true },
      });
      text = applyEdits(text, verEdits);
    }
  }
  const edits = modify(text, jsonPath, value, {
    formattingOptions: { tabSize: 2, insertSpaces: true },
  });
  const nextText = applyEdits(text, edits);
  fs.writeFileSync(filePath, nextText, 'utf-8');
}

export function formatConfigForDisplay(config: ReengineConfig): ReengineConfig {
  const clone = structuredClone(config);
  for (const provider of Object.values(clone.providers)) {
    if (provider.auth.key) {
      provider.auth.key = maskSecretForDisplay(provider.auth.key);
    }
    for (const [k, v] of Object.entries(provider.headers)) {
      provider.headers[k] = maskSecretForDisplay(v);
    }
  }
  for (const server of Object.values(clone.mcpServers)) {
    for (const [k, v] of Object.entries(server.env)) {
      server.env[k] = maskSecretForDisplay(v);
    }
    for (const [k, v] of Object.entries(server.headers)) {
      server.headers[k] = maskSecretForDisplay(v);
    }
  }
  for (const [k, v] of Object.entries(clone.engine.rea.env)) {
    clone.engine.rea.env[k] = maskSecretForDisplay(v);
  }
  return clone;
}
