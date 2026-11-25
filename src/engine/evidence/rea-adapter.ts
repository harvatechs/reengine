import type { EvidenceRecord, EvidenceStatus } from '../../core/contracts.js';
import { createSortableId } from '../../util/index.js';

interface EvidenceAdapter {
  readonly id: string;
  detect(toolName: string, structured: unknown, text: string): boolean;
  toRecords(
    toolName: string,
    structured: unknown,
    text: string,
    ctx: { target?: string },
  ): EvidenceRecord[];
}

function mapEvidenceState(state: unknown): EvidenceStatus {
  if (state === 'observed') return 'observed';
  if (state === 'inferred') return 'inferred';
  return 'unknown';
}

function parseJsonSafe(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function observationToRecord(
  toolName: string,
  obs: unknown,
  target: string | undefined,
): EvidenceRecord | null {
  if (typeof obs !== 'object' || obs === null) return null;
  const o = obs as Record<string, unknown>;
  const ev = (o.evidence ?? {}) as Record<string, unknown>;
  const lims = Array.isArray(ev.limitations)
    ? ev.limitations.filter((l): l is string => typeof l === 'string')
    : undefined;
  const locObj = ev.location as { value?: unknown } | undefined;
  const locStr = locObj?.value ? JSON.stringify(locObj.value).slice(0, 120) : undefined;
  const title = typeof o.label === 'string' ? o.label : toolName;
  const authority = typeof ev.authority === 'string' ? ev.authority : 'rea';
  return {
    id: typeof o.observation_id === 'string' ? o.observation_id : createSortableId('ev'),
    status: mapEvidenceState(ev.state),
    title,
    summary: `${title} (${authority})`,
    source: {
      tool: toolName,
      ...(target ? { target } : {}),
      ...(locStr ? { location: locStr } : {}),
    },
    ...(lims && lims.length > 0 ? { limitations: lims } : {}),
  };
}

function extractGraphObservations(
  toolName: string,
  payload: Record<string, unknown>,
  target: string | undefined,
): EvidenceRecord[] {
  const out: EvidenceRecord[] = [];
  const norm = payload.normalized_result as Record<string, unknown> | undefined;
  const graph = norm?.graph as { nodes?: Array<Record<string, unknown>> } | undefined;
  if (!Array.isArray(graph?.nodes)) return out;

  for (const node of graph.nodes) {
    if (!Array.isArray(node.observations)) continue;
    for (const obs of node.observations) {
      const rec = observationToRecord(toolName, obs, target);
      if (rec) out.push(rec);
    }
  }
  return out;
}

function extractPayloadObject(
  structured: unknown,
  text: string,
): Record<string, unknown> | undefined {
  if (typeof structured === 'object' && structured !== null) {
    return structured as Record<string, unknown>;
  }
  const parsed = parseJsonSafe(text);
  return typeof parsed === 'object' && parsed !== null
    ? (parsed as Record<string, unknown>)
    : undefined;
}

const reaEvidenceAdapter: EvidenceAdapter = {
  id: 'rea',
  detect(_toolName, structured, text) {
    const obj = extractPayloadObject(structured, text);
    return Boolean(obj && ('evidence_id' in obj || 'normalized_result' in obj));
  },
  toRecords(toolName, structured, text, ctx) {
    try {
      const obj = extractPayloadObject(structured, text);
      if (!obj) return [];

      const subject = obj.subject as { local_path?: string; name?: string } | undefined;
      const target = ctx.target ?? subject?.local_path ?? subject?.name;
      const graphRecords = extractGraphObservations(toolName, obj, target);
      if (graphRecords.length > 0) {
        return graphRecords.slice(0, 50);
      }

      const norm = obj.normalized_result as { limitations?: unknown[] } | undefined;
      const lims = Array.isArray(norm?.limitations)
        ? norm.limitations.filter((l): l is string => typeof l === 'string')
        : [];
      return [
        {
          id: typeof obj.evidence_id === 'string' ? obj.evidence_id : createSortableId('ev'),
          status: 'observed',
          title: `${toolName} result`,
          summary: `Completed ${toolName}${target ? ` on ${target}` : ''}`,
          source: { tool: toolName, ...(target ? { target } : {}) },
          ...(lims.length > 0 ? { limitations: lims } : {}),
        },
      ];
    } catch {
      return [];
    }
  },
};

const genericEvidenceAdapter: EvidenceAdapter = {
  id: 'generic',
  detect: () => true,
  toRecords(toolName, _structured, text, ctx) {
    if (!text.trim()) return [];
    return [
      {
        id: createSortableId('ev'),
        status: 'observed',
        title: `${toolName} observation`,
        summary: text.slice(0, 200),
        source: { tool: toolName, ...(ctx.target ? { target: ctx.target } : {}) },
      },
    ];
  },
};

export function normalizeToolEvidence(
  toolName: string,
  structured: unknown,
  text: string,
  options: { target?: string; producesObservations?: boolean } = {},
): EvidenceRecord[] {
  try {
    if (reaEvidenceAdapter.detect(toolName, structured, text)) {
      return reaEvidenceAdapter.toRecords(toolName, structured, text, {
        ...(options.target ? { target: options.target } : {}),
      });
    }
    if (options.producesObservations) {
      return genericEvidenceAdapter.toRecords(toolName, structured, text, {
        ...(options.target ? { target: options.target } : {}),
      });
    }
    return [];
  } catch {
    return [];
  }
}
