import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type {
  EvidenceRecord,
  JsonSchema,
  Tool,
  ToolContext,
  ToolOutput,
} from '../core/contracts.js';
import { inferPathArgsFromSchema } from './naming.js';

export interface AdaptToolOptions {
  serverName: string;
  safeName: string;
  originalName: string;
  description: string;
  inputSchema: JsonSchema;
  requestTimeoutMs: number;
  getClient: () => Client | null;
  annotations?: {
    readOnlyHint?: boolean | undefined;
    destructiveHint?: boolean | undefined;
    openWorldHint?: boolean | undefined;
  };
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

function formatMcpContentBlocks(rawContent: unknown): string {
  if (!Array.isArray(rawContent)) return '';
  return rawContent
    .map((b) => {
      const blk = b as { type?: string; text?: string };
      return blk.type === 'text' && typeof blk.text === 'string'
        ? blk.text
        : `[unsupported MCP content block: ${blk.type ?? 'unknown'}]`;
    })
    .join('\n');
}

function resolveToolFlags(opts: AdaptToolOptions) {
  const ov = opts.policyOverride?.(opts.originalName);
  const ann = opts.annotations ?? {};
  const readOnly = ov?.readOnly ?? Boolean(ann.readOnlyHint);
  const destructive = readOnly ? false : ann.destructiveHint !== false;
  return {
    readOnly,
    destructive,
    openWorld: ov?.openWorld ?? ann.openWorldHint ?? true,
    pathArgs: ov?.pathArgs ?? inferPathArgsFromSchema(opts.inputSchema),
    risk: ov?.risk ?? 'mcp',
  };
}

export function createMcpToolAdapter(opts: AdaptToolOptions): Tool {
  const { readOnly, destructive, openWorld, pathArgs, risk } = resolveToolFlags(opts);

  return {
    name: opts.safeName,
    description: opts.description,
    inputSchema: opts.inputSchema,
    risk,
    readOnly,
    destructive,
    openWorld,
    pathArgs,
    source: { kind: 'mcp', server: opts.serverName, originalName: opts.originalName },
    describe: () => `${opts.safeName}(${opts.originalName})`,
    execute: async (input: unknown, ctx: ToolContext): Promise<ToolOutput> => {
      const client = opts.getClient();
      if (!client) {
        return { isError: true, content: `MCP_CONNECTION_LOST: ${opts.serverName} not ready` };
      }
      try {
        const result = await client.callTool(
          {
            name: opts.originalName,
            arguments:
              typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {},
          },
          undefined,
          {
            signal: ctx.signal,
            timeout: opts.requestTimeoutMs,
            resetTimeoutOnProgress: true,
            onprogress: (p) => {
              ctx.reportProgress({
                progress: p.progress,
                ...(p.total !== undefined ? { total: p.total } : {}),
              });
            },
          },
        );
        const text = formatMcpContentBlocks(result.content);
        const evidence = opts.evidenceTransform?.(
          opts.originalName,
          result.structuredContent,
          text,
        );
        return {
          isError: Boolean(result.isError),
          content: text,
          ...(result.structuredContent !== undefined
            ? { structured: result.structuredContent }
            : {}),
          ...(evidence && evidence.length > 0 ? { evidence } : {}),
        };
      } catch (err) {
        return {
          isError: true,
          content: `MCP_CONNECTION_LOST: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    },
  };
}
