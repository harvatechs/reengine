import * as http from 'node:http';
import type { AddressInfo } from 'node:net';

interface MockLlmRouteResponse {
  status?: number;
  headers?: Record<string, string>;
  json?: unknown;
  sseChunks?: string[];
}

export interface MockLlmServer {
  url: string;
  requests: Array<{
    method: string;
    path: string;
    headers: http.IncomingHttpHeaders;
    body: unknown;
  }>;
  enqueue(res: MockLlmRouteResponse): void;
  close(): Promise<void>;
}

export async function startMockLlmServer(): Promise<MockLlmServer> {
  const queue: MockLlmRouteResponse[] = [];
  const requests: MockLlmServer['requests'] = [];

  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const rawBody = Buffer.concat(chunks).toString('utf-8');
      let parsedBody: unknown = rawBody;
      try {
        parsedBody = rawBody ? (JSON.parse(rawBody) as unknown) : undefined;
      } catch {
        // Keep raw string
      }
      requests.push({
        method: req.method ?? 'GET',
        path: req.url ?? '/',
        headers: req.headers,
        body: parsedBody,
      });

      const next = queue.shift() ?? { status: 200, json: { data: [{ id: 'mock-model' }] } };
      if (next.sseChunks) {
        res.writeHead(next.status ?? 200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          ...(next.headers ?? {}),
        });
        for (const chunk of next.sseChunks) {
          res.write(chunk);
        }
        res.end();
        return;
      }
      res.writeHead(next.status ?? 200, {
        'Content-Type': 'application/json',
        ...(next.headers ?? {}),
      });
      res.end(JSON.stringify(next.json ?? {}));
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve();
    });
  });

  const addr = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${String(addr.port)}`,
    requests,
    enqueue(res: MockLlmRouteResponse) {
      queue.push(res);
    },
    close(): Promise<void> {
      return new Promise((resolve, reject) => {
        server.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    },
  };
}
