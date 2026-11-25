import * as os from 'node:os';
import * as path from 'node:path';
import {
  AgentSession,
  SessionStore,
  deleteSession,
  listSessions,
  loadMemoryFiles,
  pruneSessions,
  type AgentEvent,
  type EvidenceRecord,
  type ModelProvider,
  type PermissionMode,
  type Tool,
  type Usage,
} from '../core/index.js';
import {
  formatConfigForDisplay,
  loadConfig,
  resolveSecret,
  type ReengineConfig,
} from '../config/index.js';
import { resolveRuntimePaths } from '../platform/index.js';
import { createProvider, splitModelRef } from '../providers/index.js';
import { startEngineForSession } from './engine-service.js';
import {
  createAjvValidator,
  createReadTools,
  createShellTool,
  createUtilityTools,
  createWriteTools,
} from '../tools/index.js';
import { AppError, ConfigError, SecretRedactor } from '../util/index.js';

export interface HeadlessRunOptions {
  prompt: string;
  cwd?: string;
  model?: string;
  permissionMode?: string;
  yolo?: boolean;
  allowRules?: string[];
  targets?: string[];
  maxSteps?: number;
  timeoutSeconds?: number;
  resumeSessionId?: string;
  continueLatest?: boolean;
  extraTools?: Tool[];
  engineStatus?: string;
  onEvent?: (evt: AgentEvent) => void;
}

export interface HeadlessRunResult {
  sessionId: string;
  model: string;
  engine: string;
  result: string;
  usage: Usage;
  toolCalls: Array<{ name: string; isError: boolean; durationMs: number }>;
  evidence: EvidenceRecord[];
  exitCode: number;
}

function resolveEffectivePermissionMode(
  cfgMode: PermissionMode,
  flagMode: string | undefined,
  yolo: boolean | undefined,
): PermissionMode {
  if (yolo) {
    if (process.env.REENGINE_ALLOW_BYPASS !== '1') {
      throw new ConfigError(
        'BYPASS_NOT_ALLOWED',
        'Bypass mode (--yolo) requires REENGINE_ALLOW_BYPASS=1 in environment.',
      );
    }
    return 'bypass';
  }
  const chosen = flagMode ?? cfgMode;
  if (chosen === 'bypass' && process.env.REENGINE_ALLOW_BYPASS !== '1') {
    throw new ConfigError(
      'BYPASS_NOT_ALLOWED',
      'Bypass mode requires --yolo and REENGINE_ALLOW_BYPASS=1.',
    );
  }
  if (
    chosen === 'plan' ||
    chosen === 'default' ||
    chosen === 'acceptEdits' ||
    chosen === 'bypass'
  ) {
    return chosen;
  }
  throw new ConfigError('CONFIG_INVALID', `Invalid permission mode: ${chosen}`);
}

async function buildProviderFromConfig(
  config: ReengineConfig,
  modelRef: string,
): Promise<{ provider: ModelProvider; modelId: string }> {
  const { providerId, modelId } = splitModelRef(modelRef);
  const provCfg = config.providers[providerId];
  if (!provCfg) {
    throw new ConfigError('PROVIDER_NOT_FOUND', `Provider "${providerId}" is not configured.`);
  }
  const redactor = new SecretRedactor();
  const apiKey = provCfg.auth.key
    ? await resolveSecret(provCfg.auth.key, { sourceScope: 'user', redactor })
    : undefined;
  const provider = createProvider({
    id: providerId,
    type: provCfg.type,
    ...(provCfg.preset ? { preset: provCfg.preset } : {}),
    ...(provCfg.baseUrl ? { baseUrl: provCfg.baseUrl } : {}),
    auth: {
      type: provCfg.auth.type,
      ...(provCfg.auth.header ? { header: provCfg.auth.header } : {}),
      ...(apiKey ? { key: apiKey } : {}),
    },
    headers: provCfg.headers,
    queryParams: provCfg.queryParams,
    ...(provCfg.compat ? { compat: provCfg.compat } : {}),
    timeouts: provCfg.timeouts,
    models: provCfg.models,
  });
  return { provider, modelId };
}

function buildBuiltinTools(
  config: ReengineConfig,
  session: SessionStore,
  extraTools: Tool[],
): Tool[] {
  return [
    ...createReadTools({
      additionalDirs: config.permissions.additionalDirectories,
      maxReadBytes: config.tools.read.maxBytes,
      maxGrepMatches: config.tools.grep.maxMatches,
    }),
    ...createWriteTools({ additionalDirs: config.permissions.additionalDirectories }),
    createShellTool({
      timeoutMs: config.tools.shell.timeoutMs,
      maxOutputBytes: config.tools.shell.maxOutputBytes,
      ...(config.tools.shell.shell ? { shell: config.tools.shell.shell } : {}),
      envAllow: config.tools.shell.envAllow,
    }),
    ...createUtilityTools({
      artifactsDir: session.artifacts.dir,
      onTodoUpdate: (todos) => {
        session.append('todo', { todos });
      },
    }),
    ...extraTools,
  ];
}

function initSessionForRun(
  sessionsDir: string,
  cwd: string,
  modelRef: string,
  config: ReengineConfig,
  options: HeadlessRunOptions,
): SessionStore {
  const sessionId =
    options.resumeSessionId ??
    (options.continueLatest ? listSessions(sessionsDir)[0]?.id : undefined);
  const session = new SessionStore(sessionsDir, sessionId);
  if (session.readRecords().length === 0) {
    session.append('session_start', {
      cwd,
      model: modelRef,
      ...(config.session.storeConfigSnapshot
        ? { configSnapshot: formatConfigForDisplay(config) }
        : {}),
    });
  }
  return session;
}

async function resolveEngineForRun(
  config: ReengineConfig,
  cwd: string,
  options: HeadlessRunOptions,
): Promise<{
  supervisor: Awaited<ReturnType<typeof startEngineForSession>>['supervisor'] | undefined;
  engineStatus: string;
  engineTools: Tool[];
  targetDirs: string[];
}> {
  let supervisor: Awaited<ReturnType<typeof startEngineForSession>>['supervisor'] | undefined;
  let engineStatus = options.engineStatus ?? (config.engine.rea.enabled ? 'ready' : 'disabled');
  let engineTools: Tool[] = [];
  let targetDirs: string[] = [...config.permissions.additionalDirectories];

  if (config.engine.rea.enabled && options.engineStatus === undefined) {
    try {
      const started = await startEngineForSession(cwd, options.targets ?? []);
      supervisor = started.supervisor;
      engineTools = supervisor.getTools();
      engineStatus = supervisor.getState();
      targetDirs = [...targetDirs, ...started.targets.list()];
    } catch {
      engineStatus = 'unavailable';
    }
  }
  return { supervisor, engineStatus, engineTools, targetDirs };
}

export async function runHeadlessTurn(options: HeadlessRunOptions): Promise<HeadlessRunResult> {
  const cwd = options.cwd ?? process.cwd();
  const paths = resolveRuntimePaths();
  const { config } = loadConfig({ cwd });
  const permissionMode = resolveEffectivePermissionMode(
    config.permissions.mode,
    options.permissionMode,
    options.yolo,
  );
  const modelRef = options.model ?? config.model.default;
  if (!modelRef) {
    throw new ConfigError(
      'CONFIG_INVALID',
      'No model configured. Pass --model <provider/model> or run `reengine setup`.',
    );
  }
  const { provider, modelId } = await buildProviderFromConfig(config, modelRef);
  const session = initSessionForRun(paths.sessionsDir, cwd, modelRef, config, options);
  const memory = loadMemoryFiles(
    cwd,
    paths.configDir,
    config.context.memoryFiles,
    config.context.maxMemoryBytes,
  );
  const { supervisor, engineStatus, engineTools, targetDirs } = await resolveEngineForRun(
    config,
    cwd,
    options,
  );

  const permState = { unavailable: false };
  const agent = new AgentSession({
    provider,
    model: modelId,
    tools: buildBuiltinTools(config, session, [...engineTools, ...(options.extraTools ?? [])]),
    session,
    cwd,
    workspaceRoot: path.resolve(cwd),
    os: `${os.platform()} ${os.release()}`,
    shell: config.tools.shell.shell ?? (process.platform === 'win32' ? 'powershell' : 'sh'),
    permissionMode,
    rules: {
      allow: [...config.permissions.allow, ...(options.allowRules ?? [])],
      ask: config.permissions.ask,
      deny: config.permissions.deny,
    },
    taintGuard: config.permissions.taintGuard,
    additionalDirectories: targetDirs,
    maxSteps: options.maxSteps ?? config.model.maxSteps,
    maxOutputTokens: config.model.maxOutputTokens,
    temperature: config.model.temperature,
    reasoning: config.model.reasoning,
    compactAt: config.context.compactAt,
    keepRecentToolResults: config.context.keepRecentToolResults,
    keepRecentMessages: config.context.keepRecentMessages,
    spillThresholdTokens: config.tools.spillThresholdTokens,
    targets: options.targets ?? [],
    engineStatus,
    memoryText: memory.text,
    validateArgs: createAjvValidator(),
    onPermission: () => {
      permState.unavailable = true;
      return Promise.resolve({ kind: 'deny' });
    },
  });

  try {
    return await collectAgentStream(
      agent,
      options,
      session.sessionId,
      modelRef,
      engineStatus,
      permState,
    );
  } finally {
    await supervisor?.stop();
  }
}

async function collectAgentStream(
  agent: AgentSession,
  options: HeadlessRunOptions,
  sessionId: string,
  model: string,
  engine: string,
  permState: { unavailable: boolean },
): Promise<HeadlessRunResult> {
  const ac = new AbortController();
  const timer = options.timeoutSeconds
    ? setTimeout(() => {
        ac.abort();
      }, options.timeoutSeconds * 1000)
    : undefined;

  const toolCalls: Array<{ name: string; isError: boolean; durationMs: number }> = [];
  const evidence: EvidenceRecord[] = [];
  let result = '';
  let usage: Usage = { inputTokens: 0, outputTokens: 0 };
  let exitCode = 0;

  try {
    for await (const evt of agent.send(options.prompt, ac.signal)) {
      options.onEvent?.(evt);
      if (evt.type === 'assistant_text_delta') result += evt.text;
      else if (evt.type === 'tool_result') {
        toolCalls.push({ name: evt.tool, isError: evt.isError, durationMs: evt.durationMs });
        evidence.push(...evt.evidence);
      } else if (evt.type === 'usage') usage = evt.usage;
      else if (evt.type === 'error') exitCode = evt.error.code === 'LOOP_DETECTED' ? 7 : 3;
      else if (evt.type === 'turn_end') exitCode = mapTurnEndCode(evt.reason, exitCode);
    }
    if (permState.unavailable && exitCode === 0) exitCode = 5;
  } finally {
    if (timer) clearTimeout(timer);
  }
  return { sessionId, model, engine, result, usage, toolCalls, evidence, exitCode };
}

function mapTurnEndCode(
  reason: 'complete' | 'cancelled' | 'max_steps' | 'error' | 'budget',
  currentCode: number,
): number {
  if (reason === 'max_steps' || reason === 'budget') return 6;
  if (reason === 'cancelled') return 130;
  if (reason === 'error' && currentCode === 0) return 1;
  return currentCode;
}

export function listSessionSummaries() {
  return listSessions(resolveRuntimePaths().sessionsDir);
}

export function readSessionRecords(sessionId: string) {
  const store = new SessionStore(resolveRuntimePaths().sessionsDir, sessionId);
  const records = store.readRecords();
  if (records.length === 0)
    throw new AppError('SESSION_NOT_FOUND', `Session not found: ${sessionId}`);
  return records;
}

export function deleteSessionById(sessionId: string): boolean {
  return deleteSession(resolveRuntimePaths().sessionsDir, sessionId);
}

export function pruneOldSessions(retentionDays?: number): number {
  const { config } = loadConfig();
  return pruneSessions(
    resolveRuntimePaths().sessionsDir,
    retentionDays ?? config.session.retentionDays,
  );
}
