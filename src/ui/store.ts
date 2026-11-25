import type {
  AgentEvent,
  EvidenceRecord,
  PermissionMode,
  PermissionRequest,
  Usage,
} from '../core/contracts.js';

export type TranscriptItem =
  | { id: string; kind: 'banner'; text: string }
  | { id: string; kind: 'user'; text: string }
  | { id: string; kind: 'assistant'; text: string; reasoning?: string }
  | {
      id: string;
      kind: 'tool';
      callId: string;
      tool: string;
      summary: string;
      isError: boolean;
      durationMs: number;
      preview: string;
      artifactId?: string;
      evidence: EvidenceRecord[];
    }
  | { id: string; kind: 'notice'; level: 'info' | 'warn' | 'error'; message: string };

export interface InFlightTool {
  callId: string;
  tool: string;
  summary: string;
  startedAt: number;
  progressMessage?: string;
  progress?: number;
  total?: number;
}

export interface InspectorEngineView {
  state: string;
  version?: string;
  provider: string;
  stderrLines: readonly string[];
}

export interface UiState {
  staticItems: TranscriptItem[];
  streamingText: string;
  streamingReasoning: string;
  activeTools: InFlightTool[];
  pendingPermission: PermissionRequest | null;
  evidence: EvidenceRecord[];
  usage: Usage;
  contextTokens: number;
  contextWindow: number;
  mode: PermissionMode;
  model: string;
  cwd: string;
  engine: InspectorEngineView;
  targets: string[];
  isRunning: boolean;
  inspectorOpen: boolean;
  detailItem: TranscriptItem | null;
  helpOpen: boolean;
  notice: { level: 'info' | 'warn'; message: string } | null;
}

export type UiAction =
  | { type: 'agent_event'; event: AgentEvent; now?: number }
  | { type: 'user_submit'; id: string; text: string }
  | { type: 'toggle_inspector' }
  | { type: 'toggle_help' }
  | { type: 'open_detail'; item: TranscriptItem | null }
  | { type: 'set_mode'; mode: PermissionMode }
  | { type: 'set_model'; model: string }
  | { type: 'set_engine'; engine: InspectorEngineView }
  | { type: 'set_targets'; targets: string[] }
  | { type: 'clear_notice' }
  | { type: 'clear_session' };

export function createInitialUiState(opts: {
  banner: string;
  mode: PermissionMode;
  model: string;
  cwd: string;
  engine: InspectorEngineView;
  targets: string[];
  inspectorOpen: boolean;
}): UiState {
  return {
    staticItems: [{ id: 'banner-0', kind: 'banner', text: opts.banner }],
    streamingText: '',
    streamingReasoning: '',
    activeTools: [],
    pendingPermission: null,
    evidence: [],
    usage: { inputTokens: 0, outputTokens: 0 },
    contextTokens: 0,
    contextWindow: 128_000,
    mode: opts.mode,
    model: opts.model,
    cwd: opts.cwd,
    engine: opts.engine,
    targets: opts.targets,
    isRunning: false,
    inspectorOpen: opts.inspectorOpen,
    detailItem: null,
    helpOpen: false,
    notice: null,
  };
}

function reduceToolProgress(
  state: UiState,
  evt: Extract<AgentEvent, { type: 'tool_progress' }>,
): UiState {
  return {
    ...state,
    activeTools: state.activeTools.map((t) =>
      t.callId === evt.callId
        ? {
            ...t,
            ...(evt.message !== undefined ? { progressMessage: evt.message } : {}),
            ...(evt.progress !== undefined ? { progress: evt.progress } : {}),
            ...(evt.total !== undefined ? { total: evt.total } : {}),
          }
        : t,
    ),
  };
}

function reduceToolResult(
  state: UiState,
  evt: Extract<AgentEvent, { type: 'tool_result' }>,
): UiState {
  const item: TranscriptItem = {
    id: `tool-${evt.callId}`,
    kind: 'tool',
    callId: evt.callId,
    tool: evt.tool,
    summary: state.activeTools.find((t) => t.callId === evt.callId)?.summary ?? evt.tool,
    isError: evt.isError,
    durationMs: evt.durationMs,
    preview: evt.modelView,
    ...(evt.artifactId ? { artifactId: evt.artifactId } : {}),
    evidence: evt.evidence,
  };
  return {
    ...state,
    activeTools: state.activeTools.filter((t) => t.callId !== evt.callId),
    pendingPermission:
      state.pendingPermission?.callId === evt.callId ? null : state.pendingPermission,
    staticItems: [...state.staticItems, item],
    evidence: [...state.evidence, ...evt.evidence],
  };
}

function reduceAssistantMessage(
  state: UiState,
  evt: Extract<AgentEvent, { type: 'assistant_message' }>,
): UiState {
  const nextStatic = [...state.staticItems];
  if (state.streamingText.trim() || state.streamingReasoning.trim()) {
    nextStatic.push({
      id: evt.message.id,
      kind: 'assistant',
      text: state.streamingText,
      ...(state.streamingReasoning ? { reasoning: state.streamingReasoning } : {}),
    });
  }
  return { ...state, staticItems: nextStatic, streamingText: '', streamingReasoning: '' };
}

function reduceAgentEvent(state: UiState, evt: AgentEvent, now: number): UiState {
  switch (evt.type) {
    case 'turn_start':
      return { ...state, isRunning: true, streamingText: '', streamingReasoning: '' };
    case 'assistant_text_delta':
      return { ...state, streamingText: state.streamingText + evt.text };
    case 'reasoning_delta':
      return { ...state, streamingReasoning: state.streamingReasoning + evt.text };
    case 'assistant_message':
      return reduceAssistantMessage(state, evt);
    case 'tool_pending':
      return {
        ...state,
        activeTools: [
          ...state.activeTools,
          { callId: evt.callId, tool: evt.tool, summary: evt.summary, startedAt: now },
        ],
      };
    case 'permission_request':
      return { ...state, pendingPermission: evt.request };
    case 'tool_progress':
      return reduceToolProgress(state, evt);
    case 'tool_result':
      return reduceToolResult(state, evt);
    case 'usage':
      return {
        ...state,
        usage: evt.usage,
        contextTokens: evt.contextTokens,
        contextWindow: evt.contextWindow,
      };
    case 'notice':
      return {
        ...state,
        notice: { level: evt.level, message: evt.message },
        staticItems: [
          ...state.staticItems,
          { id: `notice-${String(now)}`, kind: 'notice', level: evt.level, message: evt.message },
        ],
      };
    case 'error':
      return {
        ...state,
        staticItems: [
          ...state.staticItems,
          {
            id: `err-${String(now)}`,
            kind: 'notice',
            level: 'error',
            message: `${evt.error.code}: ${evt.error.message}`,
          },
        ],
      };
    case 'turn_end':
      return { ...state, isRunning: false, activeTools: [], pendingPermission: null };
    case 'compaction':
      return {
        ...state,
        notice: {
          level: 'info',
          message: `Compacted context ${String(evt.beforeTokens)} -> ${String(evt.afterTokens)} tokens`,
        },
      };
  }
}

export function uiReducer(state: UiState, action: UiAction): UiState {
  switch (action.type) {
    case 'agent_event':
      return reduceAgentEvent(state, action.event, action.now ?? Date.now());
    case 'user_submit':
      return {
        ...state,
        staticItems: [...state.staticItems, { id: action.id, kind: 'user', text: action.text }],
      };
    case 'toggle_inspector':
      return { ...state, inspectorOpen: !state.inspectorOpen };
    case 'toggle_help':
      return { ...state, helpOpen: !state.helpOpen };
    case 'open_detail':
      return { ...state, detailItem: action.item };
    case 'set_mode':
      return { ...state, mode: action.mode };
    case 'set_model':
      return { ...state, model: action.model };
    case 'set_engine':
      return { ...state, engine: action.engine };
    case 'set_targets':
      return { ...state, targets: action.targets };
    case 'clear_notice':
      return { ...state, notice: null };
    case 'clear_session':
      return {
        ...state,
        staticItems: state.staticItems.slice(0, 1),
        evidence: [],
        streamingText: '',
        streamingReasoning: '',
      };
  }
}
