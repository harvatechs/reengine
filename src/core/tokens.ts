import type { Message, ToolDefinition } from './contracts.js';

function estimateUtf8Tokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(Buffer.byteLength(text, 'utf8') / 3.5);
}

export class TokenCalibrator {
  private readonly factors = new Map<string, number>();

  private key(providerId: string, modelId: string): string {
    return `${providerId}/${modelId}`;
  }

  public getFactor(providerId: string, modelId: string): number {
    return this.factors.get(this.key(providerId, modelId)) ?? 1.0;
  }

  public record(
    providerId: string,
    modelId: string,
    estimatedInput: number,
    reportedInput: number,
  ): number {
    if (estimatedInput <= 0 || reportedInput <= 0) {
      return this.getFactor(providerId, modelId);
    }
    const ratio = Math.min(2.0, Math.max(0.5, reportedInput / estimatedInput));
    const prev = this.getFactor(providerId, modelId);
    const next = Math.min(2.0, Math.max(0.5, prev * 0.7 + ratio * 0.3));
    this.factors.set(this.key(providerId, modelId), next);
    return next;
  }
}

function estimateMessageTokens(msg: Message): number {
  let tokens = 8;
  for (const part of msg.parts) {
    if (part.type === 'text' || part.type === 'reasoning') {
      tokens += estimateUtf8Tokens(part.text);
    } else if (part.type === 'tool_call') {
      tokens += estimateUtf8Tokens(part.name) + estimateUtf8Tokens(JSON.stringify(part.args ?? {}));
    } else {
      tokens += estimateUtf8Tokens(part.name) + estimateUtf8Tokens(part.modelView);
    }
  }
  return tokens;
}

export function estimateRequestTokens(
  system: string,
  messages: Message[],
  tools: ToolDefinition[],
  calibrationFactor = 1.0,
): number {
  let raw = estimateUtf8Tokens(system);
  for (const msg of messages) {
    raw += estimateMessageTokens(msg);
  }
  if (tools.length > 0) {
    raw += estimateUtf8Tokens(JSON.stringify(tools));
  }
  return Math.ceil(raw * calibrationFactor);
}

export function computeOutputReservation(
  capabilityMaxOutput: number,
  configMaxOutput: number,
): number {
  return Math.min(capabilityMaxOutput, configMaxOutput, 16_000);
}
