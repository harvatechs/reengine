import type { Message, ModelProvider, ToolDefinition } from './contracts.js';
import { getCompactionPrompt } from './prompt-builder.js';
import { estimateRequestTokens } from './tokens.js';
import { createSortableId } from '../util/index.js';

export interface CompactionOptions {
  system: string;
  tools: ToolDefinition[];
  contextWindow: number;
  compactAt: number;
  keepRecentToolResults: number;
  keepRecentMessages: number;
  compactionProvider: ModelProvider;
  compactionModel: string;
  calibrationFactor: number;
  signal: AbortSignal;
}

export function pruneOldToolResults(messages: Message[], keepRecentToolResults: number): Message[] {
  let seen = 0;
  const resultIndicesToKeep = new Set<string>();

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (!msg) continue;
    for (let j = msg.parts.length - 1; j >= 0; j--) {
      const part = msg.parts[j];
      if (part?.type === 'tool_result') {
        if (seen < keepRecentToolResults) {
          resultIndicesToKeep.add(part.callId);
        }
        seen++;
      }
    }
  }

  return messages.map((msg) => ({
    ...msg,
    parts: msg.parts.map((part) => {
      if (part.type !== 'tool_result' || resultIndicesToKeep.has(part.callId)) {
        return part;
      }
      const ref = part.artifactId ? `see artifact ${part.artifactId}` : 'output pruned';
      return {
        ...part,
        modelView: `[pruned: ${ref}]`,
      };
    }),
  }));
}

export async function compactMessagesIfNeeded(
  messages: Message[],
  opts: CompactionOptions,
  force = false,
): Promise<{
  messages: Message[];
  compacted: boolean;
  beforeTokens: number;
  afterTokens: number;
}> {
  const beforeTokens = estimateRequestTokens(
    opts.system,
    messages,
    opts.tools,
    opts.calibrationFactor,
  );
  const threshold = Math.floor(opts.contextWindow * opts.compactAt);
  if (!force && beforeTokens < threshold) {
    return { messages, compacted: false, beforeTokens, afterTokens: beforeTokens };
  }

  const pruned = pruneOldToolResults(messages, opts.keepRecentToolResults);
  const afterPrune = estimateRequestTokens(opts.system, pruned, opts.tools, opts.calibrationFactor);
  if (!force && afterPrune < threshold) {
    return { messages: pruned, compacted: true, beforeTokens, afterTokens: afterPrune };
  }

  const keepCount = Math.min(opts.keepRecentMessages, pruned.length);
  const splitIdx = Math.max(0, pruned.length - keepCount);
  const toSummarize = pruned.slice(0, splitIdx);
  const tail = pruned.slice(splitIdx);

  if (toSummarize.length === 0) {
    return {
      messages: pruned,
      compacted: afterPrune !== beforeTokens,
      beforeTokens,
      afterTokens: afterPrune,
    };
  }

  let summaryText = '';
  for await (const evt of opts.compactionProvider.stream(
    {
      model: opts.compactionModel,
      system: getCompactionPrompt(),
      messages: [
        ...toSummarize,
        {
          id: createSortableId('msg'),
          role: 'user',
          parts: [{ type: 'text', text: 'Produce the structured session summary now.' }],
          ts: Date.now(),
          meta: { synthetic: true },
        },
      ],
      tools: [],
      maxOutputTokens: 2048,
    },
    opts.signal,
  )) {
    if (evt.type === 'text_delta') {
      summaryText += evt.text;
    }
  }

  const summaryMsg: Message = {
    id: createSortableId('msg'),
    role: 'user',
    parts: [
      {
        type: 'text',
        text: `[Compacted session summary]\n${summaryText.trim() || 'No summary returned.'}`,
      },
    ],
    ts: Date.now(),
    meta: { synthetic: true },
  };
  const nextMessages = [summaryMsg, ...tail];
  const afterTokens = estimateRequestTokens(
    opts.system,
    nextMessages,
    opts.tools,
    opts.calibrationFactor,
  );
  return { messages: nextMessages, compacted: true, beforeTokens, afterTokens };
}
