import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import AjvModule from 'ajv';
import addFormatsModule from 'ajv-formats';
import type { EvidenceRecord, JsonSchema, Tool } from '../core/contracts.js';
import { buildScrubbedEnv } from '../platform/index.js';
import { McpError, type AppLogger } from '../util/index.js';
import { sanitizeMcpToolName } from './naming.js';
import { createMcpToolAdapter } from './tool-adapter.js';

export type McpConnectionState =
  'disabled' | 'connecting' | 'ready' | 'degraded' | 'reconnecting' | 'failed';

export interface McpServerEntryConfig {
  name: string;
  transport: 'stdio' | 'http' | 'sse';
  command?: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  enabled?: boolean;
  requestTimeoutMs?: number;
  trust?: 'ask' | 'readOnlyAuto' | 'trusted';
  toolAllow?: string[];
  toolDeny?: string[];
  policyOverride?: (originalName: string) =>
    | {
        risk?: 'read' | 'write' | 'exec' | 'network' | 'mcp';
        readOnly?: boolean;
        pathArgs?: string[];
        openWorld?: boolean;
      }
    | undefined;
  evidenceTransform?: (toolName: string, structured: unknown, text: string) => EvidenceRecord[];
}

export interface McpPromptDescriptor {
  server: string;
  name: string;
  slashCommand: string;
  description?: string;
  arguments: Array<{ name: string; description?: string; required?: boolean }>;
}

interface ManagedServer {
  config: McpServerEntryConfig;
  state: McpConnectionState;
  client: Client | null;
  transport: Transport | null;
  stderrLines: string[];
  tools: Tool[];
  prompts: McpPromptDescriptor[];
  reconnectAttempts: number;
  lastError?: string;
}

function createSharedAjv(): {
  compile: (s: Record<string, unknown>) => (data: unknown) => boolean;
} {
  const AjvCtor = AjvModule as unknown as new (opts: {
    allErrors: boolean;
    strict: boolean;
    validateSchema: boolean;
  }) => {
    compile: (s: Record<string, unknown>) => (data: unknown) => boolean;
  };
  const ajv = new AjvCtor({ allErrors: true, strict: false, validateSchema: false });
  const addFormats = addFormatsModule as unknown as (i: unknown) => void;
  addFormats(ajv);
  return ajv;
}

const SHARED_AJV = createSharedAjv();

function createValidator(schema: JsonSchema): ((data: unknown) => boolean) | null {
  try {
    const cleanSchema = { ...schema };
    delete cleanSchema.$schema;
    return SHARED_AJV.compile(cleanSchema);
  } catch {
    return null;
  }
}

export class McpManager {
  private readonly servers = new Map<string, ManagedServer>();
  private readonly logger: AppLogger | undefined;
  private readonly onStateChange:
    ((server: string, state: McpConnectionState, detail?: string) => void) | undefined;
  private closed = false;

  constructor(
    options: {
      logger?: AppLogger;
      onStateChange?: (server: string, state: McpConnectionState, detail?: string) => void;
    } = {},
  ) {
    this.logger = options.logger;
    this.onStateChange = options.onStateChange;
  }

  public getState(name: string): McpConnectionState {
    return this.servers.get(name)?.state ?? 'disabled';
  }

  public getStderr(name: string): readonly string[] {
    return this.servers.get(name)?.stderrLines ?? [];
  }

  public getAllTools(): Tool[] {
    const out: Tool[] = [];
    for (const s of this.servers.values()) {
      if (s.state === 'ready' || s.state === 'degraded') {
        out.push(...s.tools);
      }
    }
    return out;
  }

  public getAllPrompts(): McpPromptDescriptor[] {
    const out: McpPromptDescriptor[] = [];
    for (const s of this.servers.values()) {
      if (s.state === 'ready' || s.state === 'degraded') {
        out.push(...s.prompts);
      }
    }
    return out;
  }

  public async connectServer(config: McpServerEntryConfig): Promise<void> {
    if (config.enabled === false) {
      this.servers.set(config.name, {
        config,
        state: 'disabled',
        client: null,
        transport: null,
        stderrLines: [],
        tools: [],
        prompts: [],
        reconnectAttempts: 0,
      });
      return;
    }

    const entry: ManagedServer = this.servers.get(config.name) ?? {
      config,
      state: 'connecting',
      client: null,
      transport: null,
      stderrLines: [],
      tools: [],
      prompts: [],
      reconnectAttempts: 0,
    };
    entry.config = config;
    this.servers.set(config.name, entry);
    this.setState(entry, 'connecting');

    try {
      const { client, transport } = this.buildClientAndTransport(entry);
      entry.client = client;
      entry.transport = transport;
      await client.connect(transport);
      await this.refreshCatalog(entry);
      entry.reconnectAttempts = 0;
      this.setState(entry, 'ready');
    } catch (err) {
      entry.lastError = err instanceof Error ? err.message : String(err);
      this.setState(entry, 'failed', entry.lastError);
      throw new McpError(
        'MCP_CONNECT_FAILED',
        `Failed to connect MCP server "${config.name}": ${entry.lastError}`,
      );
    }
  }

  public async getPromptMessages(
    serverName: string,
    promptName: string,
    args: Record<string, string>,
  ): Promise<string[]> {
    const entry = this.servers.get(serverName);
    if (!entry?.client) {
      throw new McpError('MCP_UNAVAILABLE', `MCP server "${serverName}" is not connected.`);
    }
    const res = await entry.client.getPrompt({ name: promptName, arguments: args });
    return res.messages.map((m) => {
      if (
        typeof m.content === 'object' &&
        'text' in m.content &&
        typeof m.content.text === 'string'
      ) {
        return `[${m.role}] ${m.content.text}`;
      }
      return `[${m.role}] ${JSON.stringify(m.content)}`;
    });
  }

  public async closeAll(): Promise<void> {
    this.closed = true;
    for (const entry of this.servers.values()) {
      try {
        await entry.transport?.close();
      } catch {
        // Best-effort transport close
      }
      entry.client = null;
      entry.transport = null;
    }
  }

  private setState(entry: ManagedServer, next: McpConnectionState, detail?: string): void {
    entry.state = next;
    this.onStateChange?.(entry.config.name, next, detail);
  }

  private buildClientAndTransport(entry: ManagedServer): { client: Client; transport: Transport } {
    const cfg = entry.config;
    const client = new Client({ name: 'reengine-cli', version: '0.1.0' }, { capabilities: {} });
    let transport: Transport;

    if (cfg.transport === 'stdio') {
      if (!cfg.command) {
        throw new McpError('MCP_INVALID_CONFIG', `stdio server "${cfg.name}" missing command`);
      }
      const env = buildScrubbedEnv({ overrides: cfg.env ?? {} });
      const stdio = new StdioClientTransport({
        command: cfg.command,
        args: cfg.args ?? [],
        ...(cfg.cwd ? { cwd: cfg.cwd } : {}),
        env,
        stderr: 'pipe',
      });
      stdio.stderr?.on('data', (chunk: Buffer) => {
        const lines = chunk.toString('utf-8').split(/\r?\n/).filter(Boolean);
        entry.stderrLines.push(...lines);
        if (entry.stderrLines.length > 200) {
          entry.stderrLines.splice(0, entry.stderrLines.length - 200);
        }
      });
      transport = stdio;
    } else if (cfg.transport === 'http') {
      if (!cfg.url)
        throw new McpError('MCP_INVALID_CONFIG', `http server "${cfg.name}" missing url`);
      transport = new StreamableHTTPClientTransport(new URL(cfg.url), {
        requestInit: { headers: cfg.headers ?? {} },
      });
    } else {
      if (!cfg.url)
        throw new McpError('MCP_INVALID_CONFIG', `sse server "${cfg.name}" missing url`);
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      transport = new SSEClientTransport(new URL(cfg.url), {
        requestInit: { headers: cfg.headers ?? {} },
      });
    }

    transport.onclose = () => {
      if (!this.closed && entry.state === 'ready' && cfg.transport === 'stdio') {
        void this.attemptReconnect(entry);
      }
    };
    return { client, transport };
  }

  private async attemptReconnect(entry: ManagedServer): Promise<void> {
    const delays = [1000, 3000, 9000];
    if (entry.reconnectAttempts >= delays.length) {
      this.setState(entry, 'failed', 'Exceeded 3 stdio reconnect attempts');
      return;
    }
    const delay = delays[entry.reconnectAttempts] ?? 9000;
    entry.reconnectAttempts++;
    this.setState(entry, 'reconnecting', `Attempt ${String(entry.reconnectAttempts)}`);
    await new Promise((r) => setTimeout(r, delay));
    if (this.closed) return;
    try {
      await this.connectServer(entry.config);
    } catch {
      this.logger?.warn('mcp reconnect failed', { server: entry.config.name });
    }
  }

  private async refreshCatalog(entry: ManagedServer): Promise<void> {
    if (!entry.client) return;
    const usedNames = new Set<string>();
    const tools: Tool[] = [];
    let cursor: string | undefined;

    do {
      const res = await entry.client.listTools(cursor ? { cursor } : undefined);
      for (const rawTool of res.tools) {
        const schema = rawTool.inputSchema as JsonSchema;
        const validator = createValidator(schema);
        if (!validator) {
          this.logger?.warn('mcp tool schema compile failed; skipping tool', {
            server: entry.config.name,
            tool: rawTool.name,
          });
          continue;
        }
        const safeName = sanitizeMcpToolName(entry.config.name, rawTool.name, usedNames);
        tools.push(
          createMcpToolAdapter({
            serverName: entry.config.name,
            safeName,
            originalName: rawTool.name,
            description: rawTool.description ?? '',
            inputSchema: schema,
            requestTimeoutMs: entry.config.requestTimeoutMs ?? 120_000,
            getClient: () => entry.client,
            ...(rawTool.annotations ? { annotations: rawTool.annotations } : {}),
            ...(entry.config.policyOverride ? { policyOverride: entry.config.policyOverride } : {}),
            ...(entry.config.evidenceTransform
              ? { evidenceTransform: entry.config.evidenceTransform }
              : {}),
          }),
        );
      }
      cursor = res.nextCursor;
    } while (cursor);

    entry.tools = tools;
    entry.prompts = await this.fetchPrompts(entry);
  }

  private async fetchPrompts(entry: ManagedServer): Promise<McpPromptDescriptor[]> {
    if (!entry.client) return [];
    try {
      const res = await entry.client.listPrompts();
      return res.prompts.map((p) => ({
        server: entry.config.name,
        name: p.name,
        slashCommand: `/mcp__${entry.config.name}__${p.name}`,
        ...(p.description ? { description: p.description } : {}),
        arguments: (p.arguments ?? []).map((a) => ({
          name: a.name,
          ...(a.description ? { description: a.description } : {}),
          ...(a.required !== undefined ? { required: a.required } : {}),
        })),
      }));
    } catch {
      return [];
    }
  }
}
