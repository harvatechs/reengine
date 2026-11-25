import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  ProviderError,
  type AgentEvent,
  type ContentPart,
  type EvidenceRecord,
  type EvidenceStatus,
  type JsonSchema,
  type Message,
  type ModelCapabilities,
  type ModelInfo,
  type ModelProvider,
  type ModelRequest,
  type ModelStreamEvent,
  type PermissionAnswer,
  type PermissionDecision,
  type PermissionMode,
  type PermissionRequest,
  type ProviderErrorKind,
  type ReasoningLevel,
  type Role,
  type Tool,
  type ToolContext,
  type ToolDefinition,
  type ToolOutput,
  type ToolRisk,
  type Usage,
} from '../../../src/core/contracts.js';

describe('src/core/contracts (P1-08 / Gate G1.5)', () => {
  it('constructs ProviderError with all fields', () => {
    const cause = new Error('socket hang up');
    const err = new ProviderError('Rate limited', 'rate_limit', true, 429, 2500, cause);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('ProviderError');
    expect(err.kind).toBe('rate_limit');
    expect(err.retryable).toBe(true);
    expect(err.status).toBe(429);
    expect(err.retryAfterMs).toBe(2500);
    expect(err.cause).toBe(cause);
  });

  it('enforces frozen contract types at compile time', () => {
    expectTypeOf<Role>().toEqualTypeOf<'user' | 'assistant' | 'tool'>();
    expectTypeOf<ReasoningLevel>().toEqualTypeOf<'off' | 'low' | 'medium' | 'high'>();
    expectTypeOf<ToolRisk>().toEqualTypeOf<'read' | 'write' | 'exec' | 'network' | 'mcp'>();
    expectTypeOf<EvidenceStatus>().toEqualTypeOf<'observed' | 'inferred' | 'unknown'>();
    expectTypeOf<PermissionMode>().toEqualTypeOf<'plan' | 'default' | 'acceptEdits' | 'bypass'>();
    expectTypeOf<JsonSchema>().toEqualTypeOf<Record<string, unknown>>();
    expectTypeOf<Usage>().toHaveProperty('inputTokens');
    expectTypeOf<Message>().toHaveProperty('parts');
    expectTypeOf<ContentPart>().not.toBeAny();
    expectTypeOf<ToolDefinition>().toHaveProperty('inputSchema');
    expectTypeOf<ModelCapabilities>().toHaveProperty('contextWindow');
    expectTypeOf<ModelInfo>().toHaveProperty('id');
    expectTypeOf<ModelRequest>().toHaveProperty('messages');
    expectTypeOf<ModelStreamEvent>().not.toBeAny();
    expectTypeOf<ProviderErrorKind>().not.toBeAny();
    expectTypeOf<ModelProvider>().toHaveProperty('stream');
    expectTypeOf<ToolOutput>().toHaveProperty('isError');
    expectTypeOf<ToolContext>().toHaveProperty('workspaceRoot');
    expectTypeOf<Tool>().toHaveProperty('execute');
    expectTypeOf<EvidenceRecord>().toHaveProperty('status');
    expectTypeOf<PermissionDecision>().toHaveProperty('behavior');
    expectTypeOf<PermissionAnswer>().not.toBeAny();
    expectTypeOf<PermissionRequest>().toHaveProperty('tainted');
    expectTypeOf<AgentEvent>().not.toBeAny();
  });
});
