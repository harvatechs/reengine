import { createHash } from 'node:crypto';
import type {
  AgentEvent,
  ContentPart,
  EvidenceRecord,
  Message,
  ModelProvider,
  PermissionAnswer,
  PermissionMode,
  PermissionRequest,
  ReasoningLevel,
  Tool,
  ToolDefinition,
  Usage,
} from './contracts.js';
import { evaluatePermission, type PermissionRuleSet } from './permissions.js';
import { wrapUntrustedToolOutput } from './prompt-builder.js';
import { SessionStore, spillToolOutput } from './session.js';
import { computeOutputReservation } from './tokens.js';
import { createSortableId } from '../util/index.js';

export interface ParsedToolCall {
  id: string;
  name: string;
  args: unknown;
  parseError?: string;
}

export interface TurnExecutionEnv {
  provider: ModelProvider;
  model: string;
  tools: Tool[];
  session: SessionStore;
  cwd: string;
  workspaceRoot: string;
  permissionMode: PermissionMode;
  rules: PermissionRuleSet;
  taintGuard: boolean;
  additionalDirectories: string[];
  maxOutputTokens: number;
  temperature?: number | undefined;
  reasoning?: ReasoningLevel | undefined;
  spillThresholdTokens: number;
  sessionAllowedKeys: Set<string>;
  userExactAllowRules: Set<string>;
  consecutiveFailures: Map<string, number>;
  getTainted: () => boolean;
  setTainted: (val: boolean) => void;
  validateArgs?: ((tool: Tool, args: unknown) => string | null) | undefined;
  onPermission?:
    ((req: PermissionRequest, signal: AbortSignal) => Promise<PermissionAnswer>) | undefined;
}

interface PendingCall {
  index: number;
  id: string;
  name: string;
  argsRaw: string;
}

function buildAssistantParts(
  providerId: string,
  textAcc: string,
  reasoningAcc: string,
  reasoningSig: string | undefined,
  pendingCalls: Map<number, PendingCall>,
): { parts: ContentPart[]; parsedCalls: ParsedToolCall[] } {
  const parts: ContentPart[] = [];
  if (reasoningAcc) {
    parts.push({
      type: 'reasoning',
      text: reasoningAcc,
      providerId,
      ...(reasoningSig ? { signature: reasoningSig } : {}),
    });
  }
  if (textAcc) {
    parts.push({ type: 'text', text: textAcc });
  }
  const parsedCalls: ParsedToolCall[] = [];
  for (const tc of [...pendingCalls.values()].sort((a, b) => a.index - b.index)) {
    let args: unknown = {};
    let parseError: string | undefined;
    if (tc.argsRaw.trim().length > 0) {
      try {
        args = JSON.parse(tc.argsRaw) as unknown;
      } catch (e) {
        parseError = `Arguments were not valid JSON: ${e instanceof Error ? e.message : String(e)}`;
      }
    }
    parts.push({ type: 'tool_call', id: tc.id, name: tc.name, args });
    parsedCalls.push({ id: tc.id, name: tc.name, args, ...(parseError ? { parseError } : {}) });
  }
  return { parts, parsedCalls };
}

export async function* streamModelStep(
  env: TurnExecutionEnv,
  messages: Message[],
  system: string,
  tools: ToolDefinition[],
  capMaxOutput: number,
  signal: AbortSignal,
): AsyncGenerator<
  AgentEvent,
  {
    assistantMsg: Message;
    toolCalls: ParsedToolCall[];
    finishReason: 'stop' | 'tool_calls' | 'length' | 'content_filter';
    usage?: Usage;
  }
> {
  let textAcc = '';
  let reasoningAcc = '';
  let reasoningSig: string | undefined;
  const pendingCalls = new Map<number, PendingCall>();
  let finishReason: 'stop' | 'tool_calls' | 'length' | 'content_filter' = 'stop';
  let usage: Usage | undefined;

  for await (const evt of env.provider.stream(
    {
      model: env.model,
      system,
      messages,
      tools,
      maxOutputTokens: computeOutputReservation(capMaxOutput, env.maxOutputTokens),
      ...(env.temperature !== undefined ? { temperature: env.temperature } : {}),
      ...(env.reasoning !== undefined ? { reasoning: env.reasoning } : {}),
    },
    signal,
  )) {
    if (evt.type === 'text_delta') {
      textAcc += evt.text;
      yield { type: 'assistant_text_delta', text: evt.text };
    } else if (evt.type === 'reasoning_delta') {
      reasoningAcc += evt.text;
      if (evt.signature) reasoningSig = evt.signature;
      if (evt.text) yield { type: 'reasoning_delta', text: evt.text };
    } else if (evt.type === 'tool_call_start') {
      pendingCalls.set(evt.index, { index: evt.index, id: evt.id, name: evt.name, argsRaw: '' });
    } else if (evt.type === 'tool_call_delta') {
      const call = pendingCalls.get(evt.index);
      if (call) call.argsRaw += evt.argsFragment;
    } else if (evt.type === 'usage') {
      usage = evt.usage;
    } else if (evt.type === 'finish') {
      finishReason = evt.reason;
    }
  }

  const { parts, parsedCalls } = buildAssistantParts(
    env.provider.id,
    textAcc,
    reasoningAcc,
    reasoningSig,
    pendingCalls,
  );
  const assistantMsg: Message = {
    id: createSortableId('msg'),
    role: 'assistant',
    parts,
    ts: Date.now(),
    meta: { providerId: env.provider.id, modelId: env.model, ...(usage ? { usage } : {}) },
  };
  return { assistantMsg, toolCalls: parsedCalls, finishReason, ...(usage ? { usage } : {}) };
}

function makeToolError(
  call: ParsedToolCall,
  msg: string,
): {
  events: AgentEvent[];
  part: ContentPart;
  loopExceeded: boolean;
} {
  return {
    events: [],
    part: { type: 'tool_result', callId: call.id, name: call.name, isError: true, modelView: msg },
    loopExceeded: false,
  };
}

async function authorizeToolCall(
  env: TurnExecutionEnv,
  call: ParsedToolCall,
  tool: Tool,
  summary: string,
  signal: AbortSignal,
): Promise<{ allowed: boolean; events: AgentEvent[]; denyMessage?: string }> {
  const events: AgentEvent[] = [];
  const decision = evaluatePermission(tool, call.args, summary, {
    mode: env.permissionMode,
    rules: env.rules,
    tainted: env.getTainted(),
    taintGuard: env.taintGuard,
    workspaceRoot: env.workspaceRoot,
    additionalDirectories: env.additionalDirectories,
    sessionAllowedKeys: env.sessionAllowedKeys,
    userExactAllowRules: env.userExactAllowRules,
  });

  if (decision.behavior === 'deny') {
    return { allowed: false, events, denyMessage: `Permission denied: ${decision.reason}` };
  }
  if (decision.behavior === 'allow') {
    return { allowed: true, events };
  }

  const req: PermissionRequest = {
    callId: call.id,
    tool: tool.name,
    summary,
    risk: tool.risk,
    tainted: env.getTainted(),
  };
  events.push({ type: 'permission_request', request: req });
  const answer = env.onPermission
    ? await env.onPermission(req, signal)
    : ({ kind: 'deny' } as const);
  if (answer.kind === 'deny' || answer.kind === 'deny_with_feedback') {
    const denyMessage =
      answer.kind === 'deny_with_feedback'
        ? `User denied with feedback: ${answer.feedback}`
        : `Permission denied by user: ${decision.reason}`;
    return { allowed: false, events, denyMessage };
  }
  if (answer.kind === 'allow_session' || answer.kind === 'allow_project_rule') {
    env.sessionAllowedKeys.add(`${tool.name}:${summary}`);
  }
  return { allowed: true, events };
}

function finalizeToolOutcome(
  env: TurnExecutionEnv,
  call: ParsedToolCall,
  tool: Tool,
  output: { isError: boolean; content: string; evidence?: EvidenceRecord[] },
  durationMs: number,
  events: AgentEvent[],
): { events: AgentEvent[]; part: ContentPart; loopExceeded: boolean } {
  if (tool.openWorld) env.setTainted(true);
  const spilled = spillToolOutput(output.content, env.spillThresholdTokens, env.session.artifacts);
  const modelView = tool.openWorld
    ? wrapUntrustedToolOutput(tool.name, spilled.modelView)
    : spilled.modelView;
  const evidence: EvidenceRecord[] = output.evidence ?? [];
  const evidenceIds = evidence.map((e) => e.id);

  env.session.append('tool_end', {
    callId: call.id,
    tool: tool.name,
    isError: output.isError,
    durationMs,
    ...(spilled.artifactId ? { artifactId: spilled.artifactId } : {}),
    evidence,
  });
  events.push({
    type: 'tool_result',
    callId: call.id,
    tool: tool.name,
    isError: output.isError,
    durationMs,
    modelView,
    ...(spilled.artifactId ? { artifactId: spilled.artifactId } : {}),
    evidence,
  });

  const sigKey = `${tool.name}:${createHash('sha256')
    .update(JSON.stringify(call.args ?? {}))
    .digest('hex')}`;
  let loopExceeded = false;
  if (output.isError) {
    const count = (env.consecutiveFailures.get(sigKey) ?? 0) + 1;
    env.consecutiveFailures.set(sigKey, count);
    if (count >= 5) loopExceeded = true;
  } else {
    env.consecutiveFailures.delete(sigKey);
  }

  return {
    events,
    part: {
      type: 'tool_result',
      callId: call.id,
      name: tool.name,
      isError: output.isError,
      modelView,
      ...(spilled.artifactId ? { artifactId: spilled.artifactId } : {}),
      ...(evidenceIds.length > 0 ? { evidenceIds } : {}),
    },
    loopExceeded,
  };
}

async function runSingleToolCall(
  env: TurnExecutionEnv,
  call: ParsedToolCall,
  tool: Tool | undefined,
  signal: AbortSignal,
): Promise<{ events: AgentEvent[]; part: ContentPart; loopExceeded: boolean }> {
  if (call.parseError) return makeToolError(call, call.parseError);
  if (!tool) return makeToolError(call, `Unknown tool: ${call.name}`);

  const schemaErr = env.validateArgs?.(tool, call.args);
  if (schemaErr) return makeToolError(call, `Invalid arguments for ${call.name}: ${schemaErr}`);

  const summary = tool.describe(call.args);
  const auth = await authorizeToolCall(env, call, tool, summary, signal);
  if (!auth.allowed) {
    return makeToolError(call, auth.denyMessage ?? 'Permission denied');
  }

  const events: AgentEvent[] = [
    ...auth.events,
    { type: 'tool_pending', callId: call.id, tool: tool.name, summary },
  ];
  env.session.append('tool_start', { callId: call.id, tool: tool.name, summary });
  const started = Date.now();
  let output: { isError: boolean; content: string; evidence?: EvidenceRecord[] };
  try {
    output = await tool.execute(call.args, {
      cwd: env.cwd,
      workspaceRoot: env.workspaceRoot,
      signal,
      reportProgress: () => undefined,
    });
  } catch (e) {
    output = {
      isError: true,
      content: signal.aborted
        ? 'Tool execution cancelled.'
        : `Tool execution failed: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
  return finalizeToolOutcome(env, call, tool, output, Date.now() - started, events);
}

function collectReadOnlySlice(
  calls: ParsedToolCall[],
  startIdx: number,
  toolMap: Map<string, Tool>,
): ParsedToolCall[] {
  const batch: ParsedToolCall[] = [];
  for (let i = startIdx; i < calls.length && batch.length < 4; i++) {
    const candidate = calls[i];
    const t = candidate ? toolMap.get(candidate.name) : undefined;
    if (!candidate || !t?.readOnly || candidate.parseError) break;
    batch.push(candidate);
  }
  return batch;
}

export async function* executeToolBatchStep(
  env: TurnExecutionEnv,
  calls: ParsedToolCall[],
  signal: AbortSignal,
): AsyncGenerator<
  AgentEvent,
  { resultParts: ContentPart[]; loopExceeded: boolean; cancelled: boolean }
> {
  const resultParts: ContentPart[] = [];
  let loopExceeded = false;
  let cancelled = false;
  const toolMap = new Map(env.tools.map((t) => [t.name, t]));
  let i = 0;

  while (i < calls.length) {
    if (signal.aborted) {
      cancelled = true;
      for (const rem of calls.slice(i)) {
        resultParts.push(makeToolError(rem, 'Tool execution cancelled.').part);
      }
      break;
    }

    const first = calls[i];
    if (!first) {
      i++;
      continue;
    }
    const batch = collectReadOnlySlice(calls, i, toolMap);
    const toRun = batch.length > 0 ? batch : [first];
    i += toRun.length;
    const outcomes = await Promise.all(
      toRun.map((c) => runSingleToolCall(env, c, toolMap.get(c.name), signal)),
    );
    for (const out of outcomes) {
      for (const ev of out.events) yield ev;
      resultParts.push(out.part);
      if (out.loopExceeded) loopExceeded = true;
    }
  }

  return { resultParts, loopExceeded, cancelled };
}
