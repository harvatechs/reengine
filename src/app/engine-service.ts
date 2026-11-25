import { loadConfig, writeConfigEdit } from '../config/index.js';
import {
  ReaSupervisor,
  TargetRegistry,
  listReaToolPolicies,
  resolveReaBinary,
  runReaDoctor,
} from '../engine/index.js';
import { McpManager } from '../mcp/index.js';
import { resolveRuntimePaths } from '../platform/index.js';
import { ConfigError } from '../util/index.js';

export async function getEngineDoctor(cwd = process.cwd()) {
  const { config } = loadConfig({ cwd });
  return runReaDoctor({
    ...(config.engine.rea.command ? { configCommand: config.engine.rea.command } : {}),
    ...(config.engine.rea.args ? { configArgs: config.engine.rea.args } : {}),
    allowNpx: config.engine.rea.allowNpx,
    provider: config.engine.rea.provider,
  });
}

export function getEngineStatus(cwd = process.cwd()) {
  const { config } = loadConfig({ cwd });
  if (!config.engine.rea.enabled) {
    return { enabled: false, resolved: null as ReturnType<typeof resolveReaBinary> | null };
  }
  const resolved = resolveReaBinary({
    configCommand: config.engine.rea.command,
    configArgs: config.engine.rea.args,
    allowNpx: config.engine.rea.allowNpx,
  });
  return { enabled: true, resolved };
}

export function listEngineToolsCatalog() {
  return listReaToolPolicies();
}

export async function startEngineForSession(cwd = process.cwd(), targetsList: string[] = []) {
  const { config } = loadConfig({ cwd });
  const targets = new TargetRegistry(targetsList);
  targets.loadFromProject(cwd);

  const supervisor = new ReaSupervisor({
    enabled: config.engine.rea.enabled,
    command: config.engine.rea.command,
    args: config.engine.rea.args,
    allowNpx: config.engine.rea.allowNpx,
    provider: config.engine.rea.provider,
    env: config.engine.rea.env,
    startupTimeoutMs: config.engine.rea.startupTimeoutMs,
    requestTimeoutMs: config.engine.rea.requestTimeoutMs,
    schemaProfile: config.engine.rea.schemaProfile,
    autoSnapshot: config.engine.rea.autoSnapshot,
    workspaceRoot: cwd,
    targets,
  });

  if (config.engine.rea.enabled) {
    await supervisor.ensureStarted();
  }
  return { supervisor, targets };
}

export function listConfiguredMcpServers() {
  const { config } = loadConfig();
  return Object.entries(config.mcpServers).map(([name, s]) => ({
    name,
    transport: s.transport,
    enabled: s.enabled,
    trust: s.trust,
    target: s.command ?? s.url ?? '-',
  }));
}

export function addMcpServerConfig(
  name: string,
  opts: {
    transport: string;
    command?: string;
    args?: string[];
    url?: string;
    scope?: string;
  },
  cwd = process.cwd(),
): string {
  if (name === 'rea') {
    throw new ConfigError('CONFIG_INVALID', 'The name "rea" is reserved for the built-in engine.');
  }
  if (opts.transport !== 'stdio' && opts.transport !== 'http' && opts.transport !== 'sse') {
    throw new ConfigError('CONFIG_INVALID', `Invalid MCP transport: ${opts.transport}`);
  }
  const entry: Record<string, unknown> = {
    transport: opts.transport,
    ...(opts.command ? { command: opts.command } : {}),
    ...(opts.args && opts.args.length > 0 ? { args: opts.args } : {}),
    ...(opts.url ? { url: opts.url } : {}),
  };
  const targetFile =
    opts.scope === 'project' ? `${cwd}/.reengine/config.jsonc` : resolveRuntimePaths().configFile;
  writeConfigEdit(targetFile, ['mcpServers', name], entry);
  return targetFile;
}

export function setMcpServerEnabled(name: string, enabled: boolean): string {
  const paths = resolveRuntimePaths();
  writeConfigEdit(paths.configFile, ['mcpServers', name, 'enabled'], enabled);
  return paths.configFile;
}

export function removeMcpServerConfig(name: string): string {
  const paths = resolveRuntimePaths();
  writeConfigEdit(paths.configFile, ['mcpServers', name], undefined);
  return paths.configFile;
}

export async function runMcpDoctor() {
  const { config } = loadConfig();
  const mgr = new McpManager();
  const results: Array<{
    name: string;
    ok: boolean;
    tools: number;
    latencyMs: number;
    error?: string;
  }> = [];
  try {
    for (const [name, s] of Object.entries(config.mcpServers)) {
      const started = Date.now();
      try {
        await mgr.connectServer({
          name,
          transport: s.transport,
          ...(s.command ? { command: s.command } : {}),
          ...(s.args ? { args: s.args } : {}),
          ...(s.cwd ? { cwd: s.cwd } : {}),
          env: s.env,
          ...(s.url ? { url: s.url } : {}),
          headers: s.headers,
          enabled: s.enabled,
          requestTimeoutMs: s.requestTimeoutMs,
          trust: s.trust,
        });
        const count = mgr
          .getAllTools()
          .filter((t) => t.source.kind === 'mcp' && t.source.server === name).length;
        results.push({ name, ok: true, tools: count, latencyMs: Date.now() - started });
      } catch (e) {
        results.push({
          name,
          ok: false,
          tools: 0,
          latencyMs: Date.now() - started,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  } finally {
    await mgr.closeAll();
  }
  return results;
}
