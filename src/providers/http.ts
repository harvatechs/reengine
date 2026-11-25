import { EnvHttpProxyAgent, fetch as undiciFetch, type RequestInit as UndiciInit } from 'undici';
import { ProviderError, type ProviderErrorKind } from '../core/contracts.js';
import { combineSignals, isAbortError, type AppLogger } from '../util/index.js';

interface HttpTimeouts {
  connectMs?: number | undefined;
  idleMs?: number | undefined;
  totalMs?: number | undefined;
}

interface RetryPolicy {
  maxAttempts?: number | undefined;
  baseDelayMs?: number | undefined;
}

export interface HttpClientOptions {
  timeouts?: Partial<HttpTimeouts> | undefined;
  retry?: Partial<RetryPolicy> | undefined;
  logger?: AppLogger | undefined;
  fetchFn?: typeof fetch | undefined;
  random?: (() => number) | undefined;
}

const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504, 529]);

const CONTEXT_OVERFLOW_PATTERNS = [
  'maximum context length',
  'context_length_exceeded',
  'too many tokens',
  'prompt is too long',
  'exceeds context limit',
  'exceeds the maximum number of tokens',
  'input token count exceeds',
];

export function classifyHttpError(
  status: number,
  bodyText: string,
): {
  kind: ProviderErrorKind;
  retryable: boolean;
} {
  const lower = bodyText.toLowerCase();
  if (status === 401 || status === 403) {
    return { kind: 'auth', retryable: false };
  }
  if (status === 429) {
    return { kind: 'rate_limit', retryable: true };
  }
  if (status === 408) {
    return { kind: 'timeout', retryable: true };
  }
  if (status === 529 || (status >= 500 && status <= 599)) {
    return { kind: 'overloaded', retryable: true };
  }
  if (
    (status === 400 || status === 413) &&
    CONTEXT_OVERFLOW_PATTERNS.some((pat) => lower.includes(pat))
  ) {
    return { kind: 'context_length', retryable: false };
  }
  if (status >= 400 && status < 500) {
    return { kind: 'invalid_request', retryable: false };
  }
  return { kind: 'unknown', retryable: false };
}

export function parseRetryAfterMs(headerVal: string | null): number | undefined {
  if (!headerVal) return undefined;
  const seconds = Number(headerVal);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.round(seconds * 1000);
  }
  const dateMs = Date.parse(headerVal);
  if (Number.isFinite(dateMs)) {
    return Math.max(0, dateMs - Date.now());
  }
  return undefined;
}

function computeBackoffMs(
  attempt: number,
  baseDelayMs: number,
  retryAfterMs: number | undefined,
  random: () => number,
): number {
  if (retryAfterMs !== undefined) {
    return retryAfterMs;
  }
  const exp = baseDelayMs * 2 ** attempt;
  const jitterFactor = 0.75 + random() * 0.5;
  return Math.round(exp * jitterFactor);
}

async function sleepWithAbort(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    throw new ProviderError('Request aborted', 'aborted', false);
  }
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(new ProviderError('Request aborted', 'aborted', false));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function wrapIdleTimeoutStream(
  source: ReadableStream<Uint8Array>,
  idleMs: number,
  onTimeout: () => void,
): ReadableStream<Uint8Array> {
  const reader = source.getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const resetTimer = (): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      onTimeout();
    }, idleMs);
  };

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      resetTimer();
      try {
        const { value, done } = await reader.read();
        if (timer) clearTimeout(timer);
        if (done) {
          controller.close();
          return;
        }
        controller.enqueue(value);
      } catch (err) {
        if (timer) clearTimeout(timer);
        controller.error(err);
      }
    },
    async cancel(reason) {
      if (timer) clearTimeout(timer);
      await reader.cancel(reason);
    },
  });
}

function buildDefaultFetch(): typeof fetch {
  const hasProxy = Boolean(
    process.env.HTTP_PROXY ??
    process.env.HTTPS_PROXY ??
    process.env.http_proxy ??
    process.env.https_proxy,
  );
  const agent = hasProxy ? new EnvHttpProxyAgent() : undefined;
  return (url, init) => {
    const targetUrl = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
    const uInit: UndiciInit = {
      ...(init as unknown as UndiciInit),
      ...(agent ? { dispatcher: agent } : {}),
    };
    return undiciFetch(targetUrl, uInit) as unknown as Promise<Response>;
  };
}

function classifyCatchError(
  err: unknown,
  signal: AbortSignal,
  connectAborted: boolean,
  totalAborted: boolean,
): ProviderError {
  if (err instanceof ProviderError) return err;
  if (signal.aborted) {
    return new ProviderError('Request aborted', 'aborted', false, undefined, undefined, err);
  }
  if (isAbortError(err)) {
    if (connectAborted && !totalAborted) {
      return new ProviderError('Connection timeout', 'timeout', true, undefined, undefined, err);
    }
    if (totalAborted) {
      return new ProviderError(
        'Total request timeout',
        'timeout',
        false,
        undefined,
        undefined,
        err,
      );
    }
    return new ProviderError('Request aborted', 'aborted', false, undefined, undefined, err);
  }
  return new ProviderError(
    `Network error: ${err instanceof Error ? err.message : String(err)}`,
    'network',
    true,
    undefined,
    undefined,
    err,
  );
}

export class HttpClient {
  private readonly timeouts: { connectMs: number; idleMs: number; totalMs: number };
  private readonly retry: { maxAttempts: number; baseDelayMs: number };
  private readonly logger: AppLogger | undefined;
  private readonly fetchFn: typeof fetch;
  private readonly random: () => number;

  constructor(options: HttpClientOptions = {}) {
    this.timeouts = {
      connectMs: options.timeouts?.connectMs ?? 30_000,
      idleMs: options.timeouts?.idleMs ?? 60_000,
      totalMs: options.timeouts?.totalMs ?? 900_000,
    };
    this.retry = {
      maxAttempts: options.retry?.maxAttempts ?? 4,
      baseDelayMs: options.retry?.baseDelayMs ?? 1000,
    };
    this.logger = options.logger;
    this.fetchFn = options.fetchFn ?? buildDefaultFetch();
    this.random = options.random ?? Math.random;
  }

  public async fetchWithRetry(
    url: string,
    init: RequestInit,
    signal: AbortSignal,
  ): Promise<{ response: Response; totalController: AbortController; cleanup: () => void }> {
    const totalController = new AbortController();
    const totalTimer = setTimeout(() => {
      totalController.abort();
    }, this.timeouts.totalMs);
    const combinedSignal = combineSignals(signal, totalController.signal);
    const cleanup = (): void => {
      clearTimeout(totalTimer);
    };

    const parsedUrl = new URL(url);
    let lastError: ProviderError | undefined;

    for (let attempt = 0; attempt < this.retry.maxAttempts; attempt++) {
      if (signal.aborted) {
        cleanup();
        throw new ProviderError('Request aborted', 'aborted', false);
      }
      const connectController = new AbortController();
      const connectTimer = setTimeout(() => {
        connectController.abort();
      }, this.timeouts.connectMs);
      const attemptSignal = combineSignals(combinedSignal, connectController.signal);

      try {
        const started = Date.now();
        const res = await this.fetchFn(url, { ...init, signal: attemptSignal });
        clearTimeout(connectTimer);
        this.logger?.debug('http response', {
          host: parsedUrl.host,
          path: parsedUrl.pathname,
          status: res.status,
          durationMs: Date.now() - started,
        });
        if (res.ok) {
          return { response: res, totalController, cleanup };
        }

        const bodyText = await res.text().catch(() => '');
        const classified = classifyHttpError(res.status, bodyText);
        const retryAfterMs = parseRetryAfterMs(res.headers.get('retry-after'));
        lastError = new ProviderError(
          `HTTP ${String(res.status)} from ${parsedUrl.host}: ${bodyText.slice(0, 300)}`,
          classified.kind,
          classified.retryable,
          res.status,
          retryAfterMs,
        );
        if (!RETRYABLE_STATUSES.has(res.status) || attempt + 1 >= this.retry.maxAttempts) {
          cleanup();
          throw lastError;
        }
        await sleepWithAbort(
          computeBackoffMs(attempt, this.retry.baseDelayMs, retryAfterMs, this.random),
          combinedSignal,
        );
      } catch (err) {
        clearTimeout(connectTimer);
        lastError = classifyCatchError(
          err,
          signal,
          connectController.signal.aborted,
          totalController.signal.aborted,
        );
        if (!lastError.retryable || attempt + 1 >= this.retry.maxAttempts) {
          cleanup();
          throw lastError;
        }
        await sleepWithAbort(
          computeBackoffMs(attempt, this.retry.baseDelayMs, lastError.retryAfterMs, this.random),
          combinedSignal,
        );
      }
    }

    cleanup();
    throw lastError ?? new ProviderError('Request failed', 'unknown', false);
  }

  public async openStream(
    url: string,
    init: RequestInit,
    signal: AbortSignal,
  ): Promise<{ stream: ReadableStream<Uint8Array>; cleanup: () => void }> {
    const { response, totalController, cleanup } = await this.fetchWithRetry(url, init, signal);
    if (!response.body) {
      cleanup();
      throw new ProviderError('Empty response body for stream', 'network', false);
    }
    const wrapped = wrapIdleTimeoutStream(response.body, this.timeouts.idleMs, () => {
      totalController.abort();
    });
    return { stream: wrapped, cleanup };
  }
}
