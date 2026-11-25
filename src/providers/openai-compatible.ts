import {
  ProviderError,
  type Message,
  type ModelCapabilities,
  type ModelInfo,
  type ModelProvider,
  type ModelRequest,
  type ModelStreamEvent,
} from '../core/contracts.js';
import { HttpClient } from './http.js';
import { buildUrlWithQuery, normalizeToolCallId } from './id-remap.js';
import { parseSseStream } from './sse.js';
import { DEFAULT_MODEL_CAPABILITIES, type ProviderConfigInput } from './types.js';

interface OpenAiToolCallState {
  id: string;
  name: string;
  ended: boolean;
}

interface OpenAiChunk {
  choices?: Array<{
    delta?: {
      content?: string | null;
      reasoning_content?: string | null;
      reasoning?: string | null;
      tool_calls?: Array<{
        index?: number;
        id?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
    completion_tokens_details?: { reasoning_tokens?: number };
  };
}

function buildAuthHeaders(config: ProviderConfigInput): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...config.headers,
  };
  if (config.auth.type === 'bearer' && config.auth.key) {
    headers.Authorization = `Bearer ${config.auth.key}`;
  } else if (config.auth.type === 'header' && config.auth.key) {
    headers[config.auth.header ?? 'Authorization'] = config.auth.key;
  }
  return headers;
}

function convertMessages(req: ModelRequest, systemMode: string): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  if (req.system && systemMode !== 'first-user') {
    out.push({ role: systemMode === 'developer' ? 'developer' : 'system', content: req.system });
  }
  let injectedSystem = false;

  for (const msg of req.messages) {
    if (msg.role === 'user') {
      const text = msg.parts
        .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
        .map((p) => p.text)
        .join('\n');
      const finalContent =
        systemMode === 'first-user' && !injectedSystem && req.system
          ? `${req.system}\n\n${text}`
          : text;
      injectedSystem = true;
      out.push({ role: 'user', content: finalContent });
      continue;
    }

    if (msg.role === 'assistant') {
      out.push(convertAssistantMessage(msg));
      continue;
    }

    for (const part of msg.parts) {
      if (part.type === 'tool_result') {
        out.push({
          role: 'tool',
          tool_call_id: normalizeToolCallId(part.callId),
          content: part.modelView || '(no output)',
        });
      }
    }
  }
  return out;
}

function convertAssistantMessage(msg: Message): Record<string, unknown> {
  const text = msg.parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('');
  const toolCalls = msg.parts
    .filter(
      (p): p is { type: 'tool_call'; id: string; name: string; args: unknown } =>
        p.type === 'tool_call',
    )
    .map((tc) => ({
      id: normalizeToolCallId(tc.id),
      type: 'function',
      function: {
        name: tc.name,
        arguments: typeof tc.args === 'string' ? tc.args : JSON.stringify(tc.args ?? {}),
      },
    }));

  const res: Record<string, unknown> = { role: 'assistant', content: text || null };
  if (toolCalls.length > 0) {
    res.tool_calls = toolCalls;
  }
  return res;
}

function mapFinishReason(
  raw: string | null | undefined,
): 'stop' | 'tool_calls' | 'length' | 'content_filter' {
  if (raw === 'tool_calls') return 'tool_calls';
  if (raw === 'length') return 'length';
  if (raw === 'content_filter') return 'content_filter';
  return 'stop';
}

export class OpenAiCompatibleProvider implements ModelProvider {
  public readonly id: string;
  public readonly type = 'openai-compatible' as const;
  private readonly config: ProviderConfigInput;
  private readonly http: HttpClient;
  private readonly baseUrl: string;

  constructor(config: ProviderConfigInput, http?: HttpClient) {
    this.id = config.id;
    this.config = config;
    this.baseUrl = config.baseUrl ?? 'https://api.openai.com/v1';
    this.http = http ?? new HttpClient({ timeouts: config.timeouts });
  }

  public capabilities(modelId: string): ModelCapabilities {
    const ov = this.config.models?.[modelId] ?? {};
    const reasoning = Boolean(ov.reasoning ?? this.config.compat?.supportsReasoningEffort);
    return {
      contextWindow: ov.contextWindow ?? DEFAULT_MODEL_CAPABILITIES.contextWindow,
      maxOutputTokens: ov.maxOutputTokens ?? DEFAULT_MODEL_CAPABILITIES.maxOutputTokens,
      tools: ov.tools ?? true,
      parallelTools: ov.parallelTools ?? true,
      vision: ov.vision ?? false,
      reasoning: reasoning ? 'effort' : 'none',
      streamUsage: this.config.compat?.streamUsageInChunks ?? true,
    };
  }

  public async listModels(signal: AbortSignal): Promise<ModelInfo[]> {
    const url = buildUrlWithQuery(this.baseUrl, '/models', this.config.queryParams);
    const { response, cleanup } = await this.http.fetchWithRetry(
      url,
      { method: 'GET', headers: buildAuthHeaders(this.config) },
      signal,
    );
    try {
      const json = (await response.json()) as {
        data?: Array<{ id: string; context_length?: number }>;
      };
      return (json.data ?? []).map((m) => ({
        id: m.id,
        ...(m.context_length ? { capabilities: { contextWindow: m.context_length } } : {}),
      }));
    } finally {
      cleanup();
    }
  }

  public async *stream(req: ModelRequest, signal: AbortSignal): AsyncIterable<ModelStreamEvent> {
    const caps = this.capabilities(req.model);
    if (!caps.tools && req.tools.length > 0) {
      throw new ProviderError(
        `Model ${req.model} does not support tool calling`,
        'unsupported',
        false,
      );
    }

    const body = this.buildRequestBody(req);
    const url = buildUrlWithQuery(this.baseUrl, '/chat/completions', this.config.queryParams);
    const { stream, cleanup } = await this.http.openStream(
      url,
      { method: 'POST', headers: buildAuthHeaders(this.config), body: JSON.stringify(body) },
      signal,
    );

    const activeTools = new Map<number, OpenAiToolCallState>();
    let finished = false;

    try {
      for await (const sse of parseSseStream(stream, signal)) {
        if (sse.data === '[DONE]') {
          break;
        }
        const chunk = JSON.parse(sse.data) as OpenAiChunk;
        for (const evt of this.processChunk(chunk, activeTools)) {
          if (evt.type === 'finish') {
            finished = true;
          }
          yield evt;
        }
      }
      for (const [idx, state] of activeTools.entries()) {
        if (!state.ended) {
          state.ended = true;
          yield { type: 'tool_call_end', index: idx };
        }
      }
      if (!finished) {
        yield { type: 'finish', reason: activeTools.size > 0 ? 'tool_calls' : 'stop' };
      }
    } finally {
      cleanup();
    }
  }

  private buildRequestBody(req: ModelRequest): Record<string, unknown> {
    const compat = this.config.compat ?? {};
    const sysMode =
      compat.systemPromptMode ?? (compat.supportsDeveloperRole ? 'developer' : 'system');
    const maxKey = compat.maxTokensParam ?? 'max_tokens';
    const body: Record<string, unknown> = {
      model: req.model,
      messages: convertMessages(req, sysMode),
      [maxKey]: req.maxOutputTokens,
      stream: true,
      ...(compat.extraBody ?? {}),
    };
    if (compat.streamUsageInChunks !== false) {
      body.stream_options = { include_usage: true };
    }
    if (req.temperature !== undefined) {
      body.temperature = req.temperature;
    }
    if (req.reasoning && req.reasoning !== 'off' && compat.supportsReasoningEffort) {
      body.reasoning_effort = req.reasoning;
    }
    if (req.tools.length > 0) {
      body.tools = req.tools.map((t) => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.inputSchema },
      }));
    }
    return body;
  }

  private *processChunk(
    chunk: OpenAiChunk,
    activeTools: Map<number, OpenAiToolCallState>,
  ): Iterable<ModelStreamEvent> {
    const choice = chunk.choices?.[0];
    const delta = choice?.delta;
    if (delta?.content) {
      yield { type: 'text_delta', text: delta.content };
    }
    const reasoningText = delta?.reasoning_content ?? delta?.reasoning;
    if (reasoningText) {
      yield { type: 'reasoning_delta', text: reasoningText };
    }
    if (delta?.tool_calls) {
      yield* emitToolCallDeltas(delta.tool_calls, activeTools);
    }
    if (chunk.usage) {
      yield buildUsageEvent(chunk.usage);
    }
    if (choice?.finish_reason) {
      yield* closeActiveTools(activeTools);
      yield { type: 'finish', reason: mapFinishReason(choice.finish_reason) };
    }
  }
}

function* emitToolCallDeltas(
  toolCalls: NonNullable<NonNullable<OpenAiChunk['choices']>[number]['delta']>['tool_calls'],
  activeTools: Map<number, OpenAiToolCallState>,
): Iterable<ModelStreamEvent> {
  for (const tc of toolCalls ?? []) {
    const idx = tc.index ?? activeTools.size;
    let state = activeTools.get(idx);
    if (!state) {
      const id = normalizeToolCallId(tc.id);
      const name = tc.function?.name ?? 'unknown_tool';
      state = { id, name, ended: false };
      activeTools.set(idx, state);
      yield { type: 'tool_call_start', index: idx, id, name };
    }
    if (tc.function?.arguments) {
      yield { type: 'tool_call_delta', index: idx, argsFragment: tc.function.arguments };
    }
  }
}

function buildUsageEvent(usage: NonNullable<OpenAiChunk['usage']>): ModelStreamEvent {
  const cached = usage.prompt_tokens_details?.cached_tokens;
  const reasoning = usage.completion_tokens_details?.reasoning_tokens;
  return {
    type: 'usage',
    usage: {
      inputTokens: usage.prompt_tokens ?? 0,
      outputTokens: usage.completion_tokens ?? 0,
      ...(cached !== undefined ? { cacheReadTokens: cached } : {}),
      ...(reasoning !== undefined ? { reasoningTokens: reasoning } : {}),
    },
  };
}

function* closeActiveTools(
  activeTools: Map<number, OpenAiToolCallState>,
): Iterable<ModelStreamEvent> {
  for (const [idx, state] of activeTools.entries()) {
    if (!state.ended) {
      state.ended = true;
      yield { type: 'tool_call_end', index: idx };
    }
  }
}
