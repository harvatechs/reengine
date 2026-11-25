import {
  ProviderError,
  type Message,
  type ModelCapabilities,
  type ModelInfo,
  type ModelProvider,
  type ModelRequest,
  type ModelStreamEvent,
  type ReasoningLevel,
  type Usage,
} from '../core/contracts.js';
import { HttpClient } from './http.js';
import { buildUrlWithQuery, normalizeToolCallId } from './id-remap.js';
import { parseSseStream } from './sse.js';
import { DEFAULT_MODEL_CAPABILITIES, type ProviderConfigInput } from './types.js';

interface BlockTracker {
  kind: 'text' | 'thinking' | 'tool_use';
  toolIndex?: number;
}

function buildAnthropicHeaders(
  config: ProviderConfigInput,
  useCache: boolean,
): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'anthropic-version': '2023-06-01',
    ...config.headers,
  };
  if (useCache) {
    headers['anthropic-beta'] = 'prompt-caching-2024-07-31';
  }
  if (config.auth.key) {
    if (config.auth.type === 'bearer') {
      headers.Authorization = `Bearer ${config.auth.key}`;
    } else if (config.auth.type === 'header') {
      headers[config.auth.header ?? 'x-api-key'] = config.auth.key;
    }
  }
  return headers;
}

function thinkingBudget(level: ReasoningLevel | undefined, maxTokens: number): number | undefined {
  if (!level || level === 'off') return undefined;
  const raw = level === 'low' ? 2048 : level === 'medium' ? 8192 : 16384;
  return Math.min(raw, Math.max(1024, maxTokens - 256));
}

function convertPart(
  part: Message['parts'][number],
  providerId: string,
): Record<string, unknown> | null {
  if (part.type === 'text') return { type: 'text', text: part.text };
  if (part.type === 'reasoning' && part.providerId === providerId && part.signature) {
    return { type: 'thinking', thinking: part.text, signature: part.signature };
  }
  if (part.type === 'tool_call') {
    return {
      type: 'tool_use',
      id: normalizeToolCallId(part.id),
      name: part.name,
      input: typeof part.args === 'object' && part.args !== null ? part.args : {},
    };
  }
  if (part.type === 'tool_result') {
    return {
      type: 'tool_result',
      tool_use_id: normalizeToolCallId(part.callId),
      content: part.modelView || '(no output)',
      is_error: part.isError,
    };
  }
  return null;
}

function convertMessages(
  messages: Message[],
  providerId: string,
): Array<{ role: 'user' | 'assistant'; content: Array<Record<string, unknown>> }> {
  const out: Array<{ role: 'user' | 'assistant'; content: Array<Record<string, unknown>> }> = [];
  for (const msg of messages) {
    const blocks = msg.parts
      .map((p) => convertPart(p, providerId))
      .filter((b): b is Record<string, unknown> => b !== null);
    if (blocks.length === 0) continue;
    const targetRole = msg.role === 'assistant' ? 'assistant' : 'user';
    const prev = out[out.length - 1];
    if (prev && prev.role === targetRole) {
      prev.content.push(...blocks);
    } else {
      out.push({ role: targetRole, content: blocks });
    }
  }
  return out;
}

function mapStopReason(
  raw: string | undefined,
): 'stop' | 'tool_calls' | 'length' | 'content_filter' {
  if (raw === 'tool_use') return 'tool_calls';
  if (raw === 'max_tokens') return 'length';
  return 'stop';
}

function throwAnthropicStreamError(payload: Record<string, unknown>): never {
  const errObj = payload.error as { type?: string; message?: string } | undefined;
  const isAuth = errObj?.type === 'authentication_error';
  const isOver = errObj?.type === 'overloaded_error' || errObj?.type === 'rate_limit_error';
  throw new ProviderError(
    errObj?.message ?? 'Anthropic stream error',
    isAuth ? 'auth' : isOver ? 'overloaded' : 'invalid_request',
    false,
  );
}

function handleMessageStart(payload: Record<string, unknown>, usage: Usage): void {
  const msg = payload.message as { usage?: Record<string, number> } | undefined;
  if (!msg?.usage) return;
  usage.inputTokens = msg.usage.input_tokens ?? 0;
  if (msg.usage.cache_read_input_tokens !== undefined) {
    usage.cacheReadTokens = msg.usage.cache_read_input_tokens;
  }
  if (msg.usage.cache_creation_input_tokens !== undefined) {
    usage.cacheWriteTokens = msg.usage.cache_creation_input_tokens;
  }
}

function handleBlockDelta(
  payload: Record<string, unknown>,
  blocks: Map<number, BlockTracker>,
): ModelStreamEvent[] {
  const index = (payload.index as number | undefined) ?? 0;
  const tracker = blocks.get(index);
  const delta = payload.delta as
    | { type?: string; text?: string; thinking?: string; signature?: string; partial_json?: string }
    | undefined;
  if (!delta) return [];
  if (delta.type === 'text_delta' && delta.text) return [{ type: 'text_delta', text: delta.text }];
  if (delta.type === 'thinking_delta' && delta.thinking) {
    return [{ type: 'reasoning_delta', text: delta.thinking }];
  }
  if (delta.type === 'signature_delta' && delta.signature) {
    return [{ type: 'reasoning_delta', text: '', signature: delta.signature }];
  }
  if (
    delta.type === 'input_json_delta' &&
    tracker?.toolIndex !== undefined &&
    delta.partial_json !== undefined
  ) {
    return [
      { type: 'tool_call_delta', index: tracker.toolIndex, argsFragment: delta.partial_json },
    ];
  }
  return [];
}

function handleBlockStart(
  payload: Record<string, unknown>,
  blocks: Map<number, BlockTracker>,
  nextToolIdx: () => number,
): ModelStreamEvent[] {
  const index = (payload.index as number | undefined) ?? blocks.size;
  const block = payload.content_block as { type?: string; id?: string; name?: string } | undefined;
  if (block?.type === 'tool_use') {
    const tIdx = nextToolIdx();
    blocks.set(index, { kind: 'tool_use', toolIndex: tIdx });
    return [
      {
        type: 'tool_call_start',
        index: tIdx,
        id: normalizeToolCallId(block.id),
        name: block.name ?? 'unknown',
      },
    ];
  }
  blocks.set(index, { kind: block?.type === 'thinking' ? 'thinking' : 'text' });
  return [];
}

export class AnthropicProvider implements ModelProvider {
  public readonly id: string;
  public readonly type = 'anthropic' as const;
  private readonly config: ProviderConfigInput;
  private readonly http: HttpClient;
  private readonly baseUrl: string;

  constructor(config: ProviderConfigInput, http?: HttpClient) {
    this.id = config.id;
    this.config = config;
    this.baseUrl = config.baseUrl ?? 'https://api.anthropic.com/v1';
    this.http = http ?? new HttpClient({ timeouts: config.timeouts });
  }

  public capabilities(modelId: string): ModelCapabilities {
    const ov = this.config.models?.[modelId];
    return {
      ...DEFAULT_MODEL_CAPABILITIES,
      contextWindow: ov?.contextWindow ?? 200_000,
      maxOutputTokens: ov?.maxOutputTokens ?? 16_000,
      tools: ov?.tools ?? true,
      parallelTools: ov?.parallelTools ?? true,
      vision: ov?.vision ?? true,
      reasoning: 'budget',
      streamUsage: true,
    };
  }

  public async listModels(signal: AbortSignal): Promise<ModelInfo[]> {
    const url = buildUrlWithQuery(this.baseUrl, '/models', this.config.queryParams);
    const { response, cleanup } = await this.http.fetchWithRetry(
      url,
      { method: 'GET', headers: buildAnthropicHeaders(this.config, false) },
      signal,
    );
    try {
      const json = (await response.json()) as {
        data?: Array<{ id: string; display_name?: string }>;
      };
      return (json.data ?? []).map((m) => ({
        id: m.id,
        ...(m.display_name ? { displayName: m.display_name } : {}),
      }));
    } finally {
      cleanup();
    }
  }

  public async *stream(req: ModelRequest, signal: AbortSignal): AsyncIterable<ModelStreamEvent> {
    const body = this.buildBody(req);
    const url = buildUrlWithQuery(this.baseUrl, '/messages', this.config.queryParams);
    const { stream, cleanup } = await this.http.openStream(
      url,
      {
        method: 'POST',
        headers: buildAnthropicHeaders(this.config, Boolean(req.cache)),
        body: JSON.stringify(body),
      },
      signal,
    );

    const blocks = new Map<number, BlockTracker>();
    let toolCounter = 0;
    const usage: Usage = { inputTokens: 0, outputTokens: 0 };
    let emittedFinish = false;

    try {
      for await (const sse of parseSseStream(stream, signal)) {
        if (sse.event === 'ping' || sse.event === 'message_stop') continue;
        const payload = JSON.parse(sse.data) as Record<string, unknown>;
        if (sse.event === 'error') {
          throwAnthropicStreamError(payload);
        }

        const events = this.handleEvent(sse.event, payload, blocks, usage, () => toolCounter++);
        for (const evt of events) {
          if (evt.type === 'finish') emittedFinish = true;
          yield evt;
        }
      }
      if (!emittedFinish) {
        yield { type: 'usage', usage };
        yield { type: 'finish', reason: toolCounter > 0 ? 'tool_calls' : 'stop' };
      }
    } finally {
      cleanup();
    }
  }

  private buildBody(req: ModelRequest): Record<string, unknown> {
    const systemPayload = req.cache?.system
      ? [{ type: 'text', text: req.system, cache_control: { type: 'ephemeral' } }]
      : req.system;
    const body: Record<string, unknown> = {
      model: req.model,
      system: systemPayload,
      messages: convertMessages(req.messages, this.id),
      max_tokens: req.maxOutputTokens,
      stream: true,
    };
    const budget = thinkingBudget(req.reasoning, req.maxOutputTokens);
    if (budget !== undefined) {
      body.thinking = { type: 'enabled', budget_tokens: budget };
    } else if (req.temperature !== undefined) {
      body.temperature = req.temperature;
    }
    if (req.tools.length > 0) {
      body.tools = req.tools.map((t, idx) => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema,
        ...(req.cache?.tools && idx === req.tools.length - 1
          ? { cache_control: { type: 'ephemeral' } }
          : {}),
      }));
    }
    return body;
  }

  private handleEvent(
    event: string,
    payload: Record<string, unknown>,
    blocks: Map<number, BlockTracker>,
    usage: Usage,
    nextToolIdx: () => number,
  ): ModelStreamEvent[] {
    if (event === 'message_start') {
      handleMessageStart(payload, usage);
      return [];
    }
    if (event === 'content_block_start') return handleBlockStart(payload, blocks, nextToolIdx);
    if (event === 'content_block_delta') return handleBlockDelta(payload, blocks);
    if (event === 'content_block_stop') {
      const index = (payload.index as number | undefined) ?? 0;
      const tracker = blocks.get(index);
      return tracker?.kind === 'tool_use' && tracker.toolIndex !== undefined
        ? [{ type: 'tool_call_end', index: tracker.toolIndex }]
        : [];
    }
    if (event === 'message_delta') {
      const msgUsage = payload.usage as { output_tokens?: number } | undefined;
      if (msgUsage?.output_tokens !== undefined) usage.outputTokens = msgUsage.output_tokens;
      const delta = payload.delta as { stop_reason?: string } | undefined;
      return [
        { type: 'usage', usage: { ...usage } },
        { type: 'finish', reason: mapStopReason(delta?.stop_reason) },
      ];
    }
    return [];
  }
}
