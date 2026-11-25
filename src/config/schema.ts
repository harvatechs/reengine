import { z } from 'zod';

const SECRET_STRING = z.string().min(1);

const CompatSchema = z
  .object({
    maxTokensParam: z.enum(['max_tokens', 'max_completion_tokens']).optional(),
    supportsDeveloperRole: z.boolean().optional(),
    supportsReasoningEffort: z.boolean().optional(),
    streamUsageInChunks: z.boolean().optional(),
    toolCallStreamMode: z.enum(['delta', 'complete']).optional(),
    systemPromptMode: z.enum(['system', 'developer', 'first-user']).optional(),
    extraBody: z.record(z.unknown()).optional(),
  })
  .strict();

const ModelPricingSchema = z
  .object({
    inputPerMTok: z.number().nonnegative(),
    outputPerMTok: z.number().nonnegative(),
    cacheReadPerMTok: z.number().nonnegative().optional(),
    cacheWritePerMTok: z.number().nonnegative().optional(),
  })
  .strict();

const ModelOverrideSchema = z
  .object({
    contextWindow: z.number().int().positive().optional(),
    maxOutputTokens: z.number().int().positive().optional(),
    tools: z.boolean().optional(),
    parallelTools: z.boolean().optional(),
    vision: z.boolean().optional(),
    reasoning: z.boolean().optional(),
    pricing: ModelPricingSchema.optional(),
  })
  .strict();

function isSafeBaseUrl(raw: string, allowInsecure?: boolean): boolean {
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === 'https:') {
      return true;
    }
    if (parsed.protocol === 'http:') {
      if (allowInsecure) {
        return true;
      }
      const host = parsed.hostname.toLowerCase();
      return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
    }
    return false;
  } catch {
    return false;
  }
}

const ProviderConfigSchema = z
  .object({
    type: z.enum(['openai-compatible', 'anthropic', 'gemini']),
    preset: z.string().min(1).optional(),
    baseUrl: z.string().url().optional(),
    allowInsecure: z.boolean().default(false),
    auth: z
      .object({
        type: z.enum(['bearer', 'header', 'none']).default('bearer'),
        header: z.string().min(1).optional(),
        key: SECRET_STRING.optional(),
      })
      .strict()
      .default({ type: 'bearer' }),
    headers: z.record(z.string()).default({}),
    queryParams: z.record(z.string()).default({}),
    compat: CompatSchema.optional(),
    timeouts: z
      .object({
        connectMs: z.number().int().positive().default(30_000),
        idleMs: z.number().int().positive().default(60_000),
        totalMs: z.number().int().positive().default(900_000),
      })
      .strict()
      .default({}),
    models: z.record(ModelOverrideSchema).default({}),
    disabled: z.boolean().default(false),
  })
  .strict()
  .superRefine((val, ctx) => {
    if (val.baseUrl !== undefined && !isSafeBaseUrl(val.baseUrl, val.allowInsecure)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['baseUrl'],
        message: 'baseUrl must use https: or loopback http: unless allowInsecure is true',
      });
    }
  });

const McpServerConfigSchema = z
  .object({
    transport: z.enum(['stdio', 'http', 'sse']),
    command: z.string().min(1).optional(),
    args: z.array(z.string()).optional(),
    cwd: z.string().min(1).optional(),
    env: z.record(z.string()).default({}),
    url: z.string().url().optional(),
    headers: z.record(z.string()).default({}),
    enabled: z.boolean().default(true),
    requestTimeoutMs: z.number().int().positive().default(120_000),
    trust: z.enum(['ask', 'readOnlyAuto', 'trusted']).default('ask'),
    toolAllow: z.array(z.string()).optional(),
    toolDeny: z.array(z.string()).optional(),
  })
  .strict();

export const ConfigSchema = z
  .object({
    $schema: z.string().optional(),
    version: z.literal(1).default(1),
    model: z
      .object({
        default: z.string().min(1).optional(),
        roles: z
          .object({
            compaction: z.string().min(1).optional(),
            title: z.string().min(1).optional(),
          })
          .strict()
          .default({}),
        maxOutputTokens: z.number().int().positive().default(16_000),
        temperature: z.number().min(0).max(2).optional(),
        reasoning: z.enum(['off', 'low', 'medium', 'high']).default('off'),
        maxSteps: z.number().int().positive().default(60),
      })
      .strict()
      .default({}),
    providers: z.record(ProviderConfigSchema).default({}),
    mcpServers: z
      .record(McpServerConfigSchema)
      .default({})
      .superRefine((servers, ctx) => {
        if ('rea' in servers) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['rea'],
            message: 'The name "rea" is reserved for the built-in engine',
          });
        }
      }),
    engine: z
      .object({
        rea: z
          .object({
            enabled: z.boolean().default(true),
            command: z.string().min(1).optional(),
            args: z.array(z.string()).optional(),
            allowNpx: z.boolean().default(false),
            provider: z.string().min(1).default('auto'),
            env: z
              .record(z.string())
              .default({})
              .superRefine((envMap, ctx) => {
                for (const key of Object.keys(envMap)) {
                  if (!key.startsWith('REA_')) {
                    ctx.addIssue({
                      code: z.ZodIssueCode.custom,
                      path: [key],
                      message: 'engine.rea.env only accepts REA_* keys',
                    });
                  }
                }
              }),
            startupTimeoutMs: z.number().int().positive().default(30_000),
            requestTimeoutMs: z.number().int().positive().default(600_000),
            schemaProfile: z.enum(['compact', 'full']).default('compact'),
            autoSnapshot: z.boolean().default(true),
            restartLimit: z.number().int().nonnegative().default(3),
          })
          .strict()
          .default({}),
      })
      .strict()
      .default({}),
    permissions: z
      .object({
        mode: z.enum(['plan', 'default', 'acceptEdits', 'bypass']).default('default'),
        allow: z.array(z.string()).default([]),
        ask: z.array(z.string()).default([]),
        deny: z.array(z.string()).default([]),
        taintGuard: z.boolean().default(true),
        additionalDirectories: z.array(z.string()).default([]),
      })
      .strict()
      .default({}),
    context: z
      .object({
        compactAt: z.number().gt(0).lte(1).default(0.8),
        keepRecentToolResults: z.number().int().nonnegative().default(8),
        keepRecentMessages: z.number().int().nonnegative().default(6),
        memoryFiles: z.array(z.string()).default(['REENGINE.md', 'AGENTS.md']),
        maxMemoryBytes: z.number().int().positive().default(65_536),
      })
      .strict()
      .default({}),
    tools: z
      .object({
        spillThresholdTokens: z.number().int().positive().default(6000),
        shell: z
          .object({
            timeoutMs: z.number().int().positive().default(120_000),
            maxOutputBytes: z.number().int().positive().default(1_048_576),
            shell: z.string().min(1).optional(),
            envAllow: z.array(z.string()).default([]),
          })
          .strict()
          .default({}),
        read: z
          .object({
            maxBytes: z.number().int().positive().default(2_097_152),
          })
          .strict()
          .default({}),
        grep: z
          .object({
            maxMatches: z.number().int().positive().default(500),
          })
          .strict()
          .default({}),
      })
      .strict()
      .default({}),
    session: z
      .object({
        retentionDays: z.number().int().positive().default(90),
        autoTitle: z.boolean().default(true),
        storeConfigSnapshot: z.boolean().default(true),
      })
      .strict()
      .default({}),
    ui: z
      .object({
        theme: z.string().min(1).default('reengine-dark'),
        density: z.enum(['compact', 'comfortable', 'spacious']).default('comfortable'),
        borders: z
          .enum(['rounded', 'single', 'double', 'bold', 'ascii', 'none'])
          .default('rounded'),
        glyphs: z.enum(['unicode', 'ascii', 'nerd']).default('unicode'),
        spinner: z.enum(['dots', 'line', 'arc', 'pulse', 'none']).default('dots'),
        markdown: z.boolean().default(true),
        wrap: z.union([z.literal('terminal'), z.number().int().positive()]).default('terminal'),
        maxContentWidth: z.number().int().positive().nullable().default(120),
        showReasoning: z.enum(['hidden', 'collapsed', 'full']).default('collapsed'),
        toolOutput: z.enum(['hidden', 'summary', 'preview', 'full']).default('preview'),
        toolOutputPreviewLines: z.number().int().positive().default(8),
        timestamps: z.boolean().default(false),
        showTokenUsage: z.boolean().default(true),
        showCost: z.boolean().default(true),
        statusBar: z.boolean().default(true),
        inspector: z
          .object({
            defaultOpen: z.boolean().default(false),
          })
          .strict()
          .default({}),
        bell: z.boolean().default(false),
        terminalTitle: z.boolean().default(true),
        plain: z.boolean().default(false),
        colorOverrides: z.record(z.unknown()).default({}),
        terminalProfile: z
          .object({
            fontFamily: z.string().optional(),
            fontSize: z.number().positive().optional(),
            lineHeight: z.number().positive().optional(),
            ligatures: z.boolean().optional(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .default({}),
    updates: z
      .object({
        check: z.boolean().default(true),
      })
      .strict()
      .default({}),
    logging: z
      .object({
        level: z.enum(['error', 'warn', 'info', 'debug', 'trace']).default('info'),
        retentionDays: z.number().int().positive().default(14),
      })
      .strict()
      .default({}),
  })
  .strict();

export type ReengineConfig = z.infer<typeof ConfigSchema>;

export const DEFAULT_CONFIG: ReengineConfig = ConfigSchema.parse({ version: 1 });
