import type {
  AgentEvent,
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
import { ProviderError } from './contracts.js';
import {
  executeToolBatchStep,
  streamModelStep,
  type ParsedToolCall,
  type TurnExecutionEnv,
} from './agent-turn.js';
import { compactMessagesIfNeeded } from './compaction.js';
import { isExactUserRule, isToolHiddenInMode, type PermissionRuleSet } from './permissions.js';
import { buildSystemPrompt } from './prompt-builder.js';
import { SessionStore } from './session.js';
import { TokenCalibrator, estimateRequestTokens } from './tokens.js';
import { createSortableId, isAbortError } from '../util/index.js';

export interface AgentSessionConfig {
  provider: ModelProvider;
  model: string;
  compactionProvider?: ModelProvider;
  compactionModel?: string;
  tools: Tool[];
  session: SessionStore;
  cwd: string;
  workspaceRoot: string;
  os: string;
  shell: string;
  permissionMode: PermissionMode;
  rules: PermissionRuleSet;
  taintGuard: boolean;
  additionalDirectories: string[];
  maxSteps: number;
  maxOutputTokens: number;
  temperature?: number | undefined;
  reasoning?: ReasoningLevel | undefined;
  compactAt: number;
  keepRecentToolResults: number;
  keepRecentMessages: number;
  spillThresholdTokens: number;
  targets: string[];
  engineStatus: string;
  memoryText?: string;
  validateArgs?: (tool: Tool, args: unknown) => string | null;
  onPermission?: (req: PermissionRequest, signal: AbortSignal) => Promise<PermissionAnswer>;
}

export class AgentSession {
  private readonly cfg: AgentSessionConfig;
  private readonly calibrator = new TokenCalibrator();
  private readonly sessionAllowedKeys = new Set<string>();
  private readonly userExactAllowRules: Set<string>;
  private readonly consecutiveFailures = new Map<string, number>();
  private messages: Message[];
  private tainted = false;

  constructor(cfg: AgentSessionConfig) {
    this.cfg = cfg;
    this.messages = cfg.session.loadMessages();
    this.userExactAllowRules = new Set(cfg.rules.allow.filter(isExactUserRule));
  }

  public getMessages(): readonly Message[] {
    return this.messages;
  }

  public async *send(userInput: string, signal: AbortSignal): AsyncIterable<AgentEvent> {
    const turnId = createSortableId('turn');
    this.tainted = false;
    this.appendMessage({
      id: createSortableId('msg'),
      role: 'user',
      parts: [{ type: 'text', text: userInput }],
      ts: Date.now(),
    });
    yield { type: 'turn_start', turnId };

    for (let step = 0; step < this.cfg.maxSteps; step++) {
      if (signal.aborted) {
        yield { type: 'turn_end', turnId, reason: 'cancelled' };
        return;
      }

      const system = this.buildSystem();
      const toolDefs: ToolDefinition[] = this.cfg.tools
        .filter((t) => !isToolHiddenInMode(t, this.cfg.permissionMode))
        .map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema }));
      const caps = this.cfg.provider.capabilities(this.cfg.model);

      for await (const cEvt of this.maybeCompact(
        system,
        toolDefs,
        caps.contextWindow,
        false,
        signal,
      )) {
        yield cEvt;
      }

      const streamOutcome = yield* this.runModelWithOverflowRetry(
        system,
        toolDefs,
        caps.contextWindow,
        caps.maxOutputTokens,
        signal,
      );
      if (streamOutcome.terminatedReason) {
        yield { type: 'turn_end', turnId, reason: streamOutcome.terminatedReason };
        return;
      }

      const sr = streamOutcome.result;
      if (sr.usage) {
        yield this.recordUsage(system, toolDefs, sr.usage, caps.contextWindow);
      }
      this.appendMessage(sr.assistantMsg);
      yield { type: 'assistant_message', message: sr.assistantMsg };

      if (sr.finishReason === 'length' && sr.toolCalls.some((c) => c.parseError !== undefined)) {
        yield* this.handleLengthTruncation();
        continue;
      }
      if (sr.toolCalls.length === 0) {
        yield { type: 'turn_end', turnId, reason: 'complete' };
        return;
      }

      const batchGen = executeToolBatchStep(this.makeTurnEnv(), sr.toolCalls, signal);
      let bNext = await batchGen.next();
      while (!bNext.done) {
        yield bNext.value;
        bNext = await batchGen.next();
      }
      if (bNext.value.resultParts.length > 0) {
        this.appendMessage({
          id: createSortableId('msg'),
          role: 'tool',
          parts: bNext.value.resultParts,
          ts: Date.now(),
        });
      }
      if (bNext.value.cancelled) {
        yield { type: 'turn_end', turnId, reason: 'cancelled' };
        return;
      }
      if (bNext.value.loopExceeded) {
        yield {
          type: 'error',
          error: {
            code: 'LOOP_DETECTED',
            message: 'Identical tool call failed 5 consecutive times.',
            retryable: false,
          },
        };
        yield { type: 'turn_end', turnId, reason: 'error' };
        return;
      }
    }

    yield { type: 'turn_end', turnId, reason: 'max_steps' };
  }

  private async *runModelWithOverflowRetry(
    system: string,
    toolDefs: ToolDefinition[],
    contextWindow: number,
    maxOutput: number,
    signal: AbortSignal,
  ): AsyncGenerator<
    AgentEvent,
    {
      result: {
        assistantMsg: Message;
        toolCalls: ParsedToolCall[];
        finishReason: 'stop' | 'tool_calls' | 'length' | 'content_filter';
        usage?: Usage;
      };
      terminatedReason?: 'cancelled' | 'error';
    }
  > {
    const emptyResult = {
      assistantMsg: { id: '', role: 'assistant' as const, parts: [], ts: 0 },
      toolCalls: [],
      finishReason: 'stop' as const,
    };
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const gen = streamModelStep(
          this.makeTurnEnv(),
          this.messages,
          system,
          toolDefs,
          maxOutput,
          signal,
        );
        let next = await gen.next();
        while (!next.done) {
          yield next.value;
          next = await gen.next();
        }
        return { result: next.value };
      } catch (err) {
        if (signal.aborted || isAbortError(err)) {
          return { result: emptyResult, terminatedReason: 'cancelled' };
        }
        if (attempt === 0 && err instanceof ProviderError && err.kind === 'context_length') {
          let compacted = false;
          for await (const cEvt of this.maybeCompact(
            system,
            toolDefs,
            contextWindow,
            true,
            signal,
          )) {
            compacted = true;
            yield cEvt;
          }
          if (compacted) continue;
        }
        const message = err instanceof Error ? err.message : String(err);
        const retryable = err instanceof ProviderError ? err.retryable : false;
        const code = err instanceof ProviderError ? err.kind.toUpperCase() : 'PROVIDER_ERROR';
        yield { type: 'error', error: { code, message, retryable } };
        return { result: emptyResult, terminatedReason: 'error' };
      }
    }
    return { result: emptyResult, terminatedReason: 'error' };
  }

  private async *maybeCompact(
    system: string,
    tools: ToolDefinition[],
    contextWindow: number,
    force: boolean,
    signal: AbortSignal,
  ): AsyncGenerator<AgentEvent> {
    const res = await compactMessagesIfNeeded(
      this.messages,
      {
        system,
        tools,
        contextWindow,
        compactAt: this.cfg.compactAt,
        keepRecentToolResults: this.cfg.keepRecentToolResults,
        keepRecentMessages: this.cfg.keepRecentMessages,
        compactionProvider: this.cfg.compactionProvider ?? this.cfg.provider,
        compactionModel: this.cfg.compactionModel ?? this.cfg.model,
        calibrationFactor: this.calibrator.getFactor(this.cfg.provider.id, this.cfg.model),
        signal,
      },
      force,
    );
    if (res.compacted) {
      this.messages = res.messages;
      this.cfg.session.append('compaction', {
        beforeTokens: res.beforeTokens,
        afterTokens: res.afterTokens,
      });
      yield { type: 'compaction', beforeTokens: res.beforeTokens, afterTokens: res.afterTokens };
    }
  }

  private recordUsage(
    system: string,
    toolDefs: ToolDefinition[],
    usage: Usage,
    contextWindow: number,
  ): AgentEvent {
    const est = estimateRequestTokens(
      system,
      this.messages,
      toolDefs,
      this.calibrator.getFactor(this.cfg.provider.id, this.cfg.model),
    );
    this.calibrator.record(this.cfg.provider.id, this.cfg.model, est, usage.inputTokens);
    this.cfg.session.append('usage', { usage });
    return { type: 'usage', usage, contextTokens: usage.inputTokens, contextWindow };
  }

  private *handleLengthTruncation(): Iterable<AgentEvent> {
    yield {
      type: 'notice',
      level: 'warn',
      message: 'Output truncated mid-tool-call; requesting smaller step.',
    };
    this.appendMessage({
      id: createSortableId('msg'),
      role: 'user',
      parts: [
        {
          type: 'text',
          text: 'Your previous response hit the output length limit mid-tool-call. Please make a smaller step.',
        },
      ],
      ts: Date.now(),
      meta: { synthetic: true },
    });
  }

  private makeTurnEnv(): TurnExecutionEnv {
    return {
      provider: this.cfg.provider,
      model: this.cfg.model,
      tools: this.cfg.tools,
      session: this.cfg.session,
      cwd: this.cfg.cwd,
      workspaceRoot: this.cfg.workspaceRoot,
      permissionMode: this.cfg.permissionMode,
      rules: this.cfg.rules,
      taintGuard: this.cfg.taintGuard,
      additionalDirectories: this.cfg.additionalDirectories,
      maxOutputTokens: this.cfg.maxOutputTokens,
      temperature: this.cfg.temperature,
      reasoning: this.cfg.reasoning,
      spillThresholdTokens: this.cfg.spillThresholdTokens,
      sessionAllowedKeys: this.sessionAllowedKeys,
      userExactAllowRules: this.userExactAllowRules,
      consecutiveFailures: this.consecutiveFailures,
      getTainted: () => this.tainted,
      setTainted: (val: boolean) => {
        this.tainted = val;
      },
      validateArgs: this.cfg.validateArgs,
      onPermission: this.cfg.onPermission,
    };
  }

  private buildSystem(): string {
    return buildSystemPrompt({
      os: this.cfg.os,
      shell: this.cfg.shell,
      cwd: this.cfg.cwd,
      date: new Date().toISOString().slice(0, 10),
      model: `${this.cfg.provider.id}/${this.cfg.model}`,
      permissionMode: this.cfg.permissionMode,
      targets: this.cfg.targets,
      engineStatus: this.cfg.engineStatus,
      ...(this.cfg.memoryText !== undefined ? { memoryText: this.cfg.memoryText } : {}),
    });
  }

  private appendMessage(message: Message): void {
    this.messages.push(message);
    this.cfg.session.append('message', { message }, message.ts);
  }
}
