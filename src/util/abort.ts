export function isAbortError(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err.name === 'AbortError' || err.name === 'TimeoutError' || err.message === 'Aborted')
  );
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    const reason: unknown = signal.reason;
    if (reason instanceof Error) {
      throw reason;
    }
    const err = new Error('Operation aborted');
    err.name = 'AbortError';
    throw err;
  }
}

export function combineSignals(...signals: Array<AbortSignal | undefined>): AbortSignal {
  const active = signals.filter((s): s is AbortSignal => s !== undefined);
  if (active.length === 0) {
    return new AbortController().signal;
  }
  if (active.length === 1 && active[0]) {
    return active[0];
  }
  return AbortSignal.any(active);
}
