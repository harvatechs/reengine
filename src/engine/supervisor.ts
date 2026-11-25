import { createHash } from 'node:crypto';
import * as path from 'node:path';
import type { Tool } from '../core/contracts.js';
import { McpManager, type McpConnectionState, type McpPromptDescriptor } from '../mcp/index.js';
import { type AppLogger } from '../util/index.js';
import { normalizeToolEvidence } from './evidence/rea-adapter.js';
import { getReaToolPolicy } from './rea-tool-policy.js';
import { resolveReaBinary } from './resolver.js';
import type { TargetRegistry } from './targets.js';

export type ReaSupervisorState =
  'absent' | 'resolving' | 'starting' | 'ready' | 'degraded' | 'restarting' | 'failed';

export interface ReaEngineOptions {
  enabled?: boolean | undefined;
  command?: string | undefined;
  args?: string[] | undefined;
  allowNpx?: boolean | undefined;
  provider?: string | undefined;
  env?: Record<string, string> | undefined;
  startupTimeoutMs?: number | undefined;
  requestTimeoutMs?: number | undefined;
  schemaProfile?: 'compact' | 'full' | undefined;
  autoSnapshot?: boolean | undefined;
  workspaceRoot: string;
  targets?: TargetRegistry | undefined;
  logger?: AppLogger | undefined;
  onNotice?: ((msg: string) => void) | undefined;
}

function mapMcpToSupervisorState(s: McpConnectionState): ReaSupervisorState {
  if (s === 'connecting') return 'starting';
  if (s === 'ready') return 'ready';
  if (s === 'degraded') return 'degraded';
  if (s === 'reconnecting') return 'restarting';
  if (s === 'failed') return 'failed';
  return 'absent';
}

export class ReaSupervisor {
  private readonly opts: ReaEngineOptions;
  private readonly mcp: McpManager;
  private state: ReaSupervisorState = 'absent';
  private startPromise: Promise<void> | null = null;
  private resolvedVersion: string | undefined;

  constructor(opts: ReaEngineOptions) {
    this.opts = opts;
    this.mcp = new McpManager({
      ...(opts.logger ? { logger: opts.logger } : {}),
      onStateChange: (_srv, next) => {
        this.state = mapMcpToSupervisorState(next);
      },
    });
  }

  public getState(): ReaSupervisorState {
    return this.state;
  }

  public getVersion(): string | undefined {
    return this.resolvedVersion;
  }

  public getStderr(): readonly string[] {
    return this.mcp.getStderr('rea');
  }

  public async ensureStarted(): Promise<void> {
    if (this.opts.enabled === false) {
      this.state = 'absent';
      return;
    }
    if (this.state === 'ready') return;
    if (this.startPromise) return this.startPromise;

    this.startPromise = this.doStart().finally(() => {
      this.startPromise = null;
    });
    return this.startPromise;
  }

  private async doStart(): Promise<void> {
    this.state = 'resolving';
    const resolved = resolveReaBinary({
      configCommand: this.opts.command,
      configArgs: this.opts.args,
      allowNpx: this.opts.allowNpx,
    });
    this.resolvedVersion = resolved.version;

    const env: Record<string, string> = {
      ...(this.opts.env ?? {}),
      REA_MCP_INPUT_SCHEMA_PROFILE: this.opts.schemaProfile ?? 'compact',
      REA_MCP_OUTPUT_SCHEMA_PROFILE: this.opts.schemaProfile ?? 'compact',
    };
    if (this.opts.provider && this.opts.provider !== 'auto') {
      env.REA_ANALYSIS_PROVIDER = this.opts.provider;
    }

    this.state = 'starting';
    await this.mcp.connectServer({
      name: 'rea',
      transport: 'stdio',
      command: resolved.command,
      args: resolved.args,
      cwd: this.opts.workspaceRoot,
      env,
      requestTimeoutMs: this.opts.requestTimeoutMs ?? 600_000,
      trust: 'readOnlyAuto',
      policyOverride: (origName) => {
        const pol = getReaToolPolicy(origName);
        if (!pol) return undefined;
        return {
          risk: pol.risk,
          readOnly: pol.readOnly,
          pathArgs: pol.pathArgs,
          openWorld: pol.openWorld,
        };
      },
      evidenceTransform: (toolName, structured, text) => {
        const pol = getReaToolPolicy(toolName);
        const firstTarget = this.opts.targets?.list()[0];
        return normalizeToolEvidence(toolName, structured, text, {
          ...(firstTarget ? { target: firstTarget } : {}),
          producesObservations: Boolean(pol?.readOnly),
        });
      },
    });
  }

  public getTools(): Tool[] {
    const rawTools = this.mcp.getAllTools();
    if (!this.opts.autoSnapshot) return rawTools;

    return rawTools.map((tool) => {
      const props = tool.inputSchema.properties as Record<string, unknown> | undefined;
      if (!props || !('snapshot_path' in props)) return tool;

      return {
        ...tool,
        execute: async (input, ctx) => {
          const rec =
            typeof input === 'object' && input !== null
              ? { ...(input as Record<string, unknown>) }
              : {};
          const targets = this.opts.targets?.list() ?? [];
          if (!('snapshot_path' in rec) && targets.length === 1 && targets[0]) {
            const hash = createHash('sha256')
              .update(`${targets[0]}:${this.opts.provider ?? 'auto'}`)
              .digest('hex')
              .slice(0, 16);
            const snapPath = path.join(
              this.opts.workspaceRoot,
              '.reengine',
              'snapshots',
              `${hash}.json`,
            );
            rec.snapshot_path = snapPath;
            this.opts.onNotice?.(`Auto-snapshot path injected: ${snapPath}`);
          }
          return tool.execute(rec, ctx);
        },
      };
    });
  }

  public getPrompts(): McpPromptDescriptor[] {
    return this.mcp.getAllPrompts();
  }

  public async restart(): Promise<void> {
    await this.mcp.closeAll();
    this.state = 'restarting';
    await this.ensureStarted();
  }

  public async stop(): Promise<void> {
    await this.mcp.closeAll();
    this.state = 'absent';
  }
}
