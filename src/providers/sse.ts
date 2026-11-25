export interface SseEvent {
  event: string;
  data: string;
  id?: string;
  retry?: number;
}

interface SseState {
  eventType: string;
  dataLines: string[];
  lastEventId: string | undefined;
  retryMs: number | undefined;
  pendingCr: boolean;
  lineBuf: string;
}

function processField(state: SseState, line: string): void {
  if (line.startsWith(':')) {
    return;
  }
  const colonIdx = line.indexOf(':');
  const field = colonIdx === -1 ? line : line.slice(0, colonIdx);
  let value = colonIdx === -1 ? '' : line.slice(colonIdx + 1);
  if (value.startsWith(' ')) {
    value = value.slice(1);
  }

  switch (field) {
    case 'event':
      state.eventType = value;
      break;
    case 'data':
      state.dataLines.push(value);
      break;
    case 'id':
      if (!value.includes('\0')) {
        state.lastEventId = value;
      }
      break;
    case 'retry':
      if (/^\d+$/.test(value)) {
        state.retryMs = Number.parseInt(value, 10);
      }
      break;
  }
}

function dispatchIfReady(state: SseState): SseEvent | null {
  if (state.dataLines.length === 0) {
    state.eventType = 'message';
    return null;
  }
  const evt: SseEvent = {
    event: state.eventType || 'message',
    data: state.dataLines.join('\n'),
  };
  if (state.lastEventId !== undefined) {
    evt.id = state.lastEventId;
  }
  if (state.retryMs !== undefined) {
    evt.retry = state.retryMs;
  }
  state.eventType = 'message';
  state.dataLines = [];
  return evt;
}

function* consumeText(state: SseState, text: string): Iterable<SseEvent> {
  let i = 0;
  if (state.pendingCr) {
    state.pendingCr = false;
    if (text.startsWith('\n')) {
      i = 1;
    }
  }

  for (; i < text.length; i++) {
    const ch = text.charAt(i);
    if (ch === '\r' || ch === '\n') {
      if (ch === '\r') {
        if (i + 1 < text.length) {
          if (text.charAt(i + 1) === '\n') {
            i++;
          }
        } else {
          state.pendingCr = true;
        }
      }
      const line = state.lineBuf;
      state.lineBuf = '';
      if (line === '') {
        const evt = dispatchIfReady(state);
        if (evt) yield evt;
      } else {
        processField(state, line);
      }
    } else {
      state.lineBuf += ch;
    }
  }
}

export async function* parseSseStream(
  stream: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncIterable<SseEvent> {
  const decoder = new TextDecoder('utf-8', { fatal: false });
  const reader = stream.getReader();
  const state: SseState = {
    eventType: 'message',
    dataLines: [],
    lastEventId: undefined,
    retryMs: undefined,
    pendingCr: false,
    lineBuf: '',
  };

  try {
    for (;;) {
      if (signal?.aborted) {
        await reader.cancel();
        return;
      }
      const { value, done } = await reader.read();
      if (done) {
        const trailing = decoder.decode();
        if (trailing) {
          yield* consumeText(state, trailing);
        }
        return;
      }
      const chunkText = decoder.decode(value, { stream: true });
      if (chunkText) {
        yield* consumeText(state, chunkText);
      }
    }
  } finally {
    reader.releaseLock();
  }
}
