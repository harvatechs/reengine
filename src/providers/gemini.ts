import type {
  Message,
  ModelCapabilities,
  ModelInfo,
  ModelProvider,
  ModelRequest,
  ModelStreamEvent,
  ReasoningLevel,
} from '../core/contracts.js';
import { HttpClient } from './http.js';
import { buildUrlWithQuery, normalizeToolCallId } from './id-remap.js';
import { parseSseStream } from './sse.js';
import { DEFAULT_MODEL_CAPABILITIES, type ProviderConfigInput } from './types.js';

interface GeminiPart {
  text?: string;
  thought?: boolean;
  functionCall?: { name?: string; args?: unknown };
}

interface GeminiResponseChunk {
  candidates?: Array<{
    content?: { parts?: GeminiPart[] };
    finishReason?: string;
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
    cachedContentTokenCount?: number;
  };
}

function buildGeminiHeaders(config: ProviderConfigInput): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...config.headers,
  };
  if (config.auth.key) {
    headers[config.auth.header ?? 'x-goog-api-key'] = config.auth.key;
  }
  return headers;
}

function geminiThinkingBudget(level: ReasoningLevel | undefined): number | undefined {
  if (!level) return undefined;
  if (level === 'off') return 0;
  if (level === 'low') return 2048;
  if (level === 'medium') return 8192;
  return 16384;
}

function convertContents(messages: Message[]): Array<{ role: 'user' | 'model'; parts: unknown[] }> {
  const out: Array<{ role: 'user' | 'model'; parts: unknown[] }> = [];
  for (const msg of messages) {
    const parts: unknown[] = [];
    for (const part of msg.parts) {
      if (part.type === 'text') {
        parts.push({ text: part.text });
      } else if (part.type === 'tool_call') {
        parts.push({
          functionCall: {
            name: part.name,
            args: typeof part.args === 'object' && part.args !== null ? part.args : {},
          },
        });
      } else if (part.type === 'tool_result') {
        parts.push({
          functionResponse: {
            name: part.name,
            response: part.isError ? { error: part.modelView } : { result: part.modelView },
          },
        });
      }
    }
    if (parts.length > 0) {
      out.push({ role: msg.role === 'assistant' ? 'model' : 'user', parts });
    }
  }
  return out;
}

function mapFinishReason(
  raw: string | undefined,
  sawToolCalls: boolean,
): 'stop' | 'tool_calls' | 'length' | 'content_filter' {
  if (sawToolCalls) return 'tool_calls';
  if (raw === 'MAX_TOKENS') return 'length';
  if (raw === 'SAFETY' || raw === 'RECITATION') return 'content_filter';
  return 'stop';
}

export class GeminiProvider implements ModelProvider {
  public readonly id: string;
  public readonly type = 'gemini' as const;
  private readonly config: ProviderConfigInput;
  private readonly http: HttpClient;
  private readonly baseUrl: string;

  constructor(config: ProviderConfigInput, http?: HttpClient) {
    this.id = config.id;
    this.config = config;
    this.baseUrl = config.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta';
    this.http = http ?? new HttpClient({ timeouts: config.timeouts });
  }

  public capabilities(modelId: string): ModelCapabilities {
    const ov = this.config.models?.[modelId];
    return {
      ...DEFAULT_MODEL_CAPABILITIES,
      contextWindow: ov?.contextWindow ?? 1_000_000,
      maxOutputTokens: ov?.maxOutputTokens ?? 8_192,
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
      { method: 'GET', headers: buildGeminiHeaders(this.config) },
      signal,
    );
    try {
      const json = (await response.json()) as {
        models?: Array<{ name: string; displayName?: string; inputTokenLimit?: number }>;
      };
      return (json.models ?? []).map((m) => ({
        id: m.name.replace(/^models\//, ''),
        ...(m.displayName ? { displayName: m.displayName } : {}),
        ...(m.inputTokenLimit ? { capabilities: { contextWindow: m.inputTokenLimit } } : {}),
      }));
    } finally {
      cleanup();
    }
  }

  public async *stream(req: ModelRequest, signal: AbortSignal): AsyncIterable<ModelStreamEvent> {
    const url = buildUrlWithQuery(
      this.baseUrl,
      `/models/${encodeURIComponent(req.model)}:streamGenerateContent`,
      { ...this.config.queryParams, alt: 'sse' },
    );
    const body = this.buildBody(req);
    const { stream, cleanup } = await this.http.openStream(
      url,
      { method: 'POST', headers: buildGeminiHeaders(this.config), body: JSON.stringify(body) },
      signal,
    );

    let toolIndex = 0;
    let sawFinish = false;

    try {
      for await (const sse of parseSseStream(stream, signal)) {
        const chunk = JSON.parse(sse.data) as GeminiResponseChunk;
        for (const evt of processGeminiChunk(chunk, () => toolIndex++)) {
          if (evt.type === 'finish') sawFinish = true;
          yield evt;
        }
      }
      if (!sawFinish) {
        yield { type: 'finish', reason: toolIndex > 0 ? 'tool_calls' : 'stop' };
      }
    } finally {
      cleanup();
    }
  }

  private buildBody(req: ModelRequest): Record<string, unknown> {
    const genCfg: Record<string, unknown> = { maxOutputTokens: req.maxOutputTokens };
    if (req.temperature !== undefined) {
      genCfg.temperature = req.temperature;
    }
    const budget = geminiThinkingBudget(req.reasoning);
    if (budget !== undefined) {
      genCfg.thinkingConfig = {
        thinkingBudget: budget,
        ...(budget > 0 ? { includeThoughts: true } : {}),
      };
    }
    const body: Record<string, unknown> = {
      contents: convertContents(req.messages),
      generationConfig: genCfg,
    };
    if (req.system) {
      body.systemInstruction = { parts: [{ text: req.system }] };
    }
    if (req.tools.length > 0) {
      body.tools = [
        {
          functionDeclarations: req.tools.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: t.inputSchema,
          })),
        },
      ];
    }
    return body;
  }
}

function buildGeminiUsageEvent(
  meta: NonNullable<GeminiResponseChunk['usageMetadata']>,
): ModelStreamEvent {
  return {
    type: 'usage',
    usage: {
      inputTokens: meta.promptTokenCount ?? 0,
      outputTokens: meta.candidatesTokenCount ?? 0,
      ...(meta.thoughtsTokenCount !== undefined
        ? { reasoningTokens: meta.thoughtsTokenCount }
        : {}),
      ...(meta.cachedContentTokenCount !== undefined
        ? { cacheReadTokens: meta.cachedContentTokenCount }
        : {}),
    },
  };
}

function processGeminiChunk(
  chunk: GeminiResponseChunk,
  nextToolIdx: () => number,
): ModelStreamEvent[] {
  const out: ModelStreamEvent[] = [];
  const candidate = chunk.candidates?.[0];
  let sawTools = false;
  for (const part of candidate?.content?.parts ?? []) {
    if (part.thought && part.text) {
      out.push({ type: 'reasoning_delta', text: part.text });
    } else if (part.text) {
      out.push({ type: 'text_delta', text: part.text });
    } else if (part.functionCall) {
      sawTools = true;
      const idx = nextToolIdx();
      out.push({
        type: 'tool_call_start',
        index: idx,
        id: normalizeToolCallId(undefined),
        name: part.functionCall.name ?? 'unknown',
      });
      out.push({
        type: 'tool_call_delta',
        index: idx,
        argsFragment: JSON.stringify(part.functionCall.args ?? {}),
      });
      out.push({ type: 'tool_call_end', index: idx });
    }
  }
  if (chunk.usageMetadata) {
    out.push(buildGeminiUsageEvent(chunk.usageMetadata));
  }
  if (candidate?.finishReason) {
    out.push({ type: 'finish', reason: mapFinishReason(candidate.finishReason, sawTools) });
  }
  return out;
}
