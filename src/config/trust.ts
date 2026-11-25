import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

interface TrustEntry {
  trustedAt: string;
  configHash: string;
}

interface TrustStore {
  folders: Record<string, TrustEntry>;
}

export interface TrustCheckResult {
  trusted: boolean;
  workspaceRealpath: string;
  configHash: string;
  reason?: 'untrusted' | 'hash_changed';
}

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      out[key] = canonicalize(value[key]);
    }
    return out;
  }
  return value;
}

function extractGatedProviders(providers: Record<string, unknown>): Record<string, unknown> {
  const gatedProviders: Record<string, unknown> = {};
  for (const [id, pVal] of Object.entries(providers)) {
    if (!isPlainObject(pVal)) continue;
    const entry: Record<string, unknown> = {};
    if ('baseUrl' in pVal) entry.baseUrl = pVal.baseUrl;
    if ('headers' in pVal) entry.headers = pVal.headers;
    if (Object.keys(entry).length > 0) {
      gatedProviders[id] = entry;
    }
  }
  return gatedProviders;
}

function extractTrustGatedSubset(rawProjectConfig: unknown): Record<string, unknown> {
  if (!isPlainObject(rawProjectConfig)) {
    return {};
  }
  const subset: Record<string, unknown> = {};

  if ('mcpServers' in rawProjectConfig) {
    subset.mcpServers = rawProjectConfig.mcpServers;
  }
  if (isPlainObject(rawProjectConfig.engine) && isPlainObject(rawProjectConfig.engine.rea)) {
    const rea = rawProjectConfig.engine.rea;
    const gatedRea: Record<string, unknown> = {};
    if ('command' in rea) gatedRea.command = rea.command;
    if ('args' in rea) gatedRea.args = rea.args;
    if ('env' in rea) gatedRea.env = rea.env;
    if (Object.keys(gatedRea).length > 0) {
      subset.engine = { rea: gatedRea };
    }
  }
  if (isPlainObject(rawProjectConfig.permissions) && 'allow' in rawProjectConfig.permissions) {
    subset.permissions = { allow: rawProjectConfig.permissions.allow };
  }
  if (isPlainObject(rawProjectConfig.providers)) {
    const gatedProviders = extractGatedProviders(rawProjectConfig.providers);
    if (Object.keys(gatedProviders).length > 0) {
      subset.providers = gatedProviders;
    }
  }
  return subset;
}

function computeTrustConfigHash(rawProjectConfig: unknown): string {
  const gated = extractTrustGatedSubset(rawProjectConfig);
  const canonical = JSON.stringify(canonicalize(gated));
  return createHash('sha256').update(canonical).digest('hex');
}

function resolveRealpathSafe(workspaceDir: string): string {
  try {
    return fs.realpathSync(workspaceDir);
  } catch {
    return path.resolve(workspaceDir);
  }
}

function readTrustStore(trustFile: string): TrustStore {
  if (!fs.existsSync(trustFile)) {
    return { folders: {} };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(trustFile, 'utf-8')) as unknown;
    if (isPlainObject(raw) && isPlainObject(raw.folders)) {
      return { folders: raw.folders as Record<string, TrustEntry> };
    }
  } catch {
    // Corrupt trust file fails closed (empty store)
  }
  return { folders: {} };
}

function writeTrustStore(trustFile: string, store: TrustStore): void {
  fs.mkdirSync(path.dirname(trustFile), { recursive: true });
  fs.writeFileSync(trustFile, JSON.stringify(store, null, 2) + '\n', {
    encoding: 'utf-8',
    mode: 0o600,
  });
}

export function checkFolderTrust(
  workspaceDir: string,
  rawProjectConfig: unknown,
  trustFile: string,
): TrustCheckResult {
  const workspaceRealpath = resolveRealpathSafe(workspaceDir);
  const configHash = computeTrustConfigHash(rawProjectConfig);
  const gated = extractTrustGatedSubset(rawProjectConfig);

  if (Object.keys(gated).length === 0) {
    return { trusted: true, workspaceRealpath, configHash };
  }

  const store = readTrustStore(trustFile);
  const entry = store.folders[workspaceRealpath];
  if (!entry) {
    return { trusted: false, workspaceRealpath, configHash, reason: 'untrusted' };
  }
  if (entry.configHash !== configHash) {
    return { trusted: false, workspaceRealpath, configHash, reason: 'hash_changed' };
  }
  return { trusted: true, workspaceRealpath, configHash };
}

export function grantFolderTrust(
  workspaceDir: string,
  rawProjectConfig: unknown,
  trustFile: string,
  nowIso: string = new Date().toISOString(),
): TrustCheckResult {
  const workspaceRealpath = resolveRealpathSafe(workspaceDir);
  const configHash = computeTrustConfigHash(rawProjectConfig);
  const store = readTrustStore(trustFile);
  store.folders[workspaceRealpath] = { trustedAt: nowIso, configHash };
  writeTrustStore(trustFile, store);
  return { trusted: true, workspaceRealpath, configHash };
}

export function revokeFolderTrust(workspaceDir: string, trustFile: string): void {
  const workspaceRealpath = resolveRealpathSafe(workspaceDir);
  const store = readTrustStore(trustFile);
  const nextFolders: Record<string, TrustEntry> = {};
  for (const [key, val] of Object.entries(store.folders)) {
    if (key !== workspaceRealpath) {
      nextFolders[key] = val;
    }
  }
  writeTrustStore(trustFile, { folders: nextFolders });
}
