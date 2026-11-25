import { describe, expect, it } from 'vitest';
import { ProviderError } from '../../../src/core/contracts.js';
import { HttpClient, classifyHttpError, parseRetryAfterMs } from '../../../src/providers/http.js';

describe('src/providers/http (P2-02)', () => {
  it('classifies HTTP error statuses and context-length messages accurately', () => {
    expect(classifyHttpError(401, 'unauthorized')).toEqual({ kind: 'auth', retryable: false });
    expect(classifyHttpError(429, 'rate limit')).toEqual({ kind: 'rate_limit', retryable: true });
    expect(classifyHttpError(529, 'overloaded')).toEqual({ kind: 'overloaded', retryable: true });
    expect(classifyHttpError(400, 'This model maximum context length is 8192 tokens')).toEqual({
      kind: 'context_length',
      retryable: false,
    });
    expect(classifyHttpError(400, 'invalid json')).toEqual({
      kind: 'invalid_request',
      retryable: false,
    });
    expect(parseRetryAfterMs('2')).toBe(2000);
    expect(parseRetryAfterMs(null)).toBeUndefined();
  });

  it('retries 429 pre-first-byte and succeeds on subsequent attempt', async () => {
    let calls = 0;
    const client = new HttpClient({
      retry: { maxAttempts: 3, baseDelayMs: 5 },
      random: () => 0.5,
      fetchFn: () => {
        calls++;
        if (calls === 1) {
          return Promise.resolve(
            new Response('slow down', { status: 429, headers: { 'retry-after': '0' } }),
          );
        }
        return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
      },
    });

    const { response, cleanup } = await client.fetchWithRetry(
      'https://api.example.com/v1/chat/completions',
      { method: 'POST' },
      new AbortController().signal,
    );
    cleanup();
    expect(calls).toBe(2);
    expect(await response.json()).toEqual({ ok: true });
  });

  it('does not retry non-retryable 401 auth error', async () => {
    let calls = 0;
    const client = new HttpClient({
      retry: { maxAttempts: 4, baseDelayMs: 5 },
      fetchFn: () => {
        calls++;
        return Promise.resolve(new Response('bad key', { status: 401 }));
      },
    });

    await expect(
      client.fetchWithRetry(
        'https://api.example.com/v1/messages',
        { method: 'POST' },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ name: 'ProviderError', kind: 'auth', retryable: false });
    expect(calls).toBe(1);
  });

  it('aborts cleanly on AbortSignal', async () => {
    const ac = new AbortController();
    ac.abort();
    const client = new HttpClient({
      fetchFn: () => Promise.resolve(new Response('ok', { status: 200 })),
    });
    await expect(
      client.fetchWithRetry('https://api.example.com/v1', {}, ac.signal),
    ).rejects.toBeInstanceOf(ProviderError);
  });
});
