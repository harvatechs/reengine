import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ModelRequest, ModelStreamEvent } from '../../../src/core/contracts.js';
import { createProvider, splitModelRef } from '../../../src/providers/index.js';
import { startMockLlmServer, type MockLlmServer } from '../../mocks/mock-llm.js';

async function collectStream(iter: AsyncIterable<ModelStreamEvent>): Promise<ModelStreamEvent[]> {
  const out: ModelStreamEvent[] = [];
  for await (const evt of iter) {
    out.push(evt);
  }
  return out;
}

describe('Provider shared contract suite (P2-07/P2-08)', () => {
  let mock: MockLlmServer;

  beforeAll(async () => {
    mock = await startMockLlmServer();
  });

  afterAll(async () => {
    await mock.close();
  });

  const baseReq: ModelRequest = {
    model: 'test-model',
    system: 'You are concise.',
    messages: [
      { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Analyze binary' }], ts: 1 },
    ],
    tools: [{ name: 'read_file', description: 'Read file', inputSchema: { type: 'object' } }],
    maxOutputTokens: 2048,
    reasoning: 'medium',
  };

  it('openai-compatible: streams text, reasoning, parallel + invalid-id tool calls, usage, and listModels', async () => {
    const provider = createProvider({
      id: 'oa',
      type: 'openai-compatible',
      baseUrl: `${mock.url}/v1`,
      auth: { type: 'bearer', key: 'sk-test' },
      headers: {},
      queryParams: {},
      compat: { supportsReasoningEffort: true },
    });

    mock.enqueue({
      sseChunks: [
        'data: {"choices":[{"delta":{"reasoning_content":"think "}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"hello "}}]}\n\n',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"bad id:with/chars!","function":{"name":"read_file","arguments":"{\\"path\\":"}}]}}]}\n\n',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"a.js\\"}"}},{"index":1,"id":"","function":{"name":"glob","arguments":"{}"}}]}}]}\n\n',
        'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n',
        'data: {"choices":[],"usage":{"prompt_tokens":10,"completion_tokens":5}}\n\n',
        'data: [DONE]\n\n',
      ],
    });

    const events = await collectStream(provider.stream(baseReq, new AbortController().signal));
    expect(events.some((e) => e.type === 'reasoning_delta' && e.text === 'think ')).toBe(true);
    expect(events.some((e) => e.type === 'text_delta' && e.text === 'hello ')).toBe(true);
    const starts = events.filter((e) => e.type === 'tool_call_start');
    expect(starts).toHaveLength(2);
    expect(starts[0]?.id).toMatch(/^[a-zA-Z0-9_-]{1,64}$/);
    expect(starts[1]?.id).toMatch(/^[a-zA-Z0-9_-]{1,64}$/);
    expect(events.some((e) => e.type === 'usage' && e.usage.inputTokens === 10)).toBe(true);
    expect(events.some((e) => e.type === 'finish' && e.reason === 'tool_calls')).toBe(true);

    mock.enqueue({ json: { data: [{ id: 'gpt-4.1', context_length: 128000 }] } });
    const models = await provider.listModels(new AbortController().signal);
    expect(models[0]?.id).toBe('gpt-4.1');
  });

  it('anthropic: streams thinking+signature, text, tool_use, usage, and supports cross-provider replay', async () => {
    const anthropic = createProvider({
      id: 'ant',
      type: 'anthropic',
      baseUrl: `${mock.url}/v1`,
      auth: { type: 'header', header: 'x-api-key', key: 'sk-ant-test' },
      headers: {},
      queryParams: {},
    });

    mock.enqueue({
      sseChunks: [
        'event: message_start\ndata: {"message":{"usage":{"input_tokens":20,"cache_read_input_tokens":5}}}\n\n',
        'event: content_block_start\ndata: {"index":0,"content_block":{"type":"thinking","thinking":""}}\n\n',
        'event: content_block_delta\ndata: {"index":0,"delta":{"type":"thinking_delta","thinking":"plan"}}\n\n',
        'event: content_block_delta\ndata: {"index":0,"delta":{"type":"signature_delta","signature":"sig_123"}}\n\n',
        'event: content_block_stop\ndata: {"index":0}\n\n',
        'event: content_block_start\ndata: {"index":1,"content_block":{"type":"tool_use","id":"toolu_1","name":"read_file","input":{}}}\n\n',
        'event: content_block_delta\ndata: {"index":1,"delta":{"type":"input_json_delta","partial_json":"{\\"path\\":\\"b.js\\"}"}}\n\n',
        'event: content_block_stop\ndata: {"index":1}\n\n',
        'event: message_delta\ndata: {"delta":{"stop_reason":"tool_use"},"usage":{"output_tokens":12}}\n\n',
        'event: message_stop\ndata: {}\n\n',
      ],
    });

    const events = await collectStream(
      anthropic.stream(
        { ...baseReq, cache: { system: true, tools: true, prefixMessages: 0 } },
        new AbortController().signal,
      ),
    );
    expect(events.some((e) => e.type === 'reasoning_delta' && e.signature === 'sig_123')).toBe(
      true,
    );
    expect(
      events.some((e) => e.type === 'tool_call_delta' && e.argsFragment.includes('b.js')),
    ).toBe(true);
    expect(events.some((e) => e.type === 'usage' && e.usage.cacheReadTokens === 5)).toBe(true);

    // Cross-provider replay: Anthropic reasoning/tool_call history replayed to OpenAI-compatible
    const oa = createProvider({
      id: 'oa',
      type: 'openai-compatible',
      baseUrl: `${mock.url}/v1`,
      auth: { type: 'bearer', key: 'sk-test' },
      headers: {},
      queryParams: {},
    });
    mock.enqueue({
      sseChunks: [
        'data: {"choices":[{"delta":{"content":"replayed"},"finish_reason":"stop"}]}\n\n',
        'data: [DONE]\n\n',
      ],
    });
    const replayEvents = await collectStream(
      oa.stream(
        {
          ...baseReq,
          messages: [
            ...baseReq.messages,
            {
              id: 'm2',
              role: 'assistant',
              ts: 2,
              parts: [
                { type: 'reasoning', text: 'plan', providerId: 'ant', signature: 'sig_123' },
                { type: 'tool_call', id: 'toolu_1', name: 'read_file', args: { path: 'b.js' } },
              ],
            },
            {
              id: 'm3',
              role: 'tool',
              ts: 3,
              parts: [
                {
                  type: 'tool_result',
                  callId: 'toolu_1',
                  name: 'read_file',
                  isError: false,
                  modelView: 'ok',
                },
              ],
            },
          ],
        },
        new AbortController().signal,
      ),
    );
    expect(replayEvents.some((e) => e.type === 'text_delta' && e.text === 'replayed')).toBe(true);
  });

  it('gemini: streams thought, text, whole functionCall, and maps STOP+functionCall to tool_calls', async () => {
    const gemini = createProvider({
      id: 'gem',
      type: 'gemini',
      baseUrl: `${mock.url}/v1beta`,
      auth: { type: 'header', header: 'x-goog-api-key', key: 'gm-test' },
      headers: {},
      queryParams: {},
    });

    mock.enqueue({
      sseChunks: [
        'data: {"candidates":[{"content":{"parts":[{"thought":true,"text":"hmm"},{"functionCall":{"name":"read_file","args":{"path":"c.js"}}}]},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":15,"candidatesTokenCount":7}}\n\n',
      ],
    });

    const events = await collectStream(gemini.stream(baseReq, new AbortController().signal));
    expect(events.some((e) => e.type === 'reasoning_delta' && e.text === 'hmm')).toBe(true);
    expect(events.some((e) => e.type === 'tool_call_start' && e.name === 'read_file')).toBe(true);
    expect(events.at(-1)).toEqual({ type: 'finish', reason: 'tool_calls' });
  });

  it('splits model refs on first slash only', () => {
    expect(splitModelRef('openrouter/google/gemini-2.5-flash')).toEqual({
      providerId: 'openrouter',
      modelId: 'google/gemini-2.5-flash',
    });
    expect(splitModelRef('gpt-4.1', 'openai')).toEqual({
      providerId: 'openai',
      modelId: 'gpt-4.1',
    });
  });
});
