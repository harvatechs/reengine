import { describe, expect, it } from 'vitest';
import { parseSseStream, type SseEvent } from '../../../src/providers/sse.js';

function streamFromChunks(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}

async function collectEvents(
  stream: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): Promise<SseEvent[]> {
  const out: SseEvent[] = [];
  for await (const evt of parseSseStream(stream, signal)) {
    out.push(evt);
  }
  return out;
}

describe('src/providers/sse (P2-01)', () => {
  it('parses CRLF, CR, LF, comments, multi-line data, id, and retry fields', async () => {
    const raw = [
      ': ping comment',
      'event: custom',
      'id: evt-1',
      'retry: 2500',
      'data: line one',
      'data: line two',
      '',
      'data:second event\r\r',
      'id: bad\0id\r\ndata: third\r\n\r\n',
    ].join('\n');

    const bytes = new TextEncoder().encode(raw);
    const events = await collectEvents(streamFromChunks([bytes]));
    expect(events).toEqual([
      { event: 'custom', data: 'line one\nline two', id: 'evt-1', retry: 2500 },
      { event: 'message', data: 'second event', id: 'evt-1', retry: 2500 },
      { event: 'message', data: 'third', id: 'evt-1', retry: 2500 },
    ]);
  });

  it('preserves multi-byte UTF-8 characters and CRLF split across arbitrary chunk boundaries (fuzz)', async () => {
    const sample =
      'event: delta\r\ndata: {"text":"こんにちは 🚀 café"}\r\n\r\n' +
      'data: {"n":1}\r\ndata: {"n":2}\r\n\r\n';
    const fullBytes = new TextEncoder().encode(sample);

    for (let seed = 1; seed <= 25; seed++) {
      const chunks: Uint8Array[] = [];
      let pos = 0;
      let s = seed * 1103515245 + 12345;
      while (pos < fullBytes.length) {
        s = (s * 1664525 + 1013904223) >>> 0;
        const size = (s % 5) + 1;
        chunks.push(fullBytes.slice(pos, Math.min(fullBytes.length, pos + size)));
        pos += size;
      }
      const events = await collectEvents(streamFromChunks(chunks));
      expect(events).toEqual([
        { event: 'delta', data: '{"text":"こんにちは 🚀 café"}' },
        { event: 'message', data: '{"n":1}\n{"n":2}' },
      ]);
    }
  });

  it('stops cleanly when AbortSignal is aborted', async () => {
    const ac = new AbortController();
    ac.abort();
    const events = await collectEvents(
      streamFromChunks([new TextEncoder().encode('data: hello\n\n')]),
      ac.signal,
    );
    expect(events).toEqual([]);
  });
});
