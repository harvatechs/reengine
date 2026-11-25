import { useEffect, useReducer, useRef } from 'react';
import { Box, Static, Text, useApp, useInput } from 'ink';
import type { AgentEvent, PermissionAnswer, PermissionMode } from '../core/contracts.js';
import type { ColorDepth } from '../platform/index.js';
import { sanitizeTerminalText } from './sanitize.js';
import { createInitialUiState, uiReducer, type InspectorEngineView } from './store.js';
import { REENGINE_DARK } from './theme/builtins.js';
import { ThemeProvider } from './theme/context.js';
import type { ThemeDefinition } from './theme/schema.js';
import { BrandLogo } from './components/BrandLogo.js';
import { Composer } from './components/Composer.js';
import { DetailViewer, HelpOverlay } from './components/DetailViewer.js';
import { Inspector } from './components/Inspector.js';
import { Markdown } from './components/Markdown.js';
import { PermissionPrompt } from './components/PermissionPrompt.js';
import { StatusBar } from './components/StatusBar.js';
import { ToolCard } from './components/ToolCard.js';

export interface ReengineAppProps {
  banner: string;
  initialMode: PermissionMode;
  model: string;
  cwd: string;
  engine: InspectorEngineView;
  targets: string[];
  theme?: ThemeDefinition;
  colorDepth?: ColorDepth;
  plain?: boolean;
  inspectorDefaultOpen?: boolean;
  onSendTurn: (
    prompt: string,
    emit: (evt: AgentEvent) => void,
    onPermission: (callId: string) => Promise<PermissionAnswer>,
    signal: AbortSignal,
  ) => Promise<void>;
  onModeChange?: (mode: PermissionMode) => void;
}

const MODE_CYCLE: readonly PermissionMode[] = ['default', 'acceptEdits', 'plan'];

export function ReengineApp(props: ReengineAppProps) {
  const { exit } = useApp();
  const [state, dispatch] = useReducer(
    uiReducer,
    {
      banner: props.banner,
      mode: props.initialMode,
      model: props.model,
      cwd: props.cwd,
      engine: props.engine,
      targets: props.targets,
      inspectorOpen: props.inspectorDefaultOpen ?? false,
    },
    createInitialUiState,
  );

  const abortRef = useRef<AbortController | null>(null);
  const permResolvers = useRef(new Map<string, (ans: PermissionAnswer) => void>());

  useInput((input, key) => {
    if (key.ctrl && input === 'o') {
      const lastTool = [...state.staticItems].reverse().find((i) => i.kind === 'tool');
      if (lastTool) dispatch({ type: 'open_detail', item: lastTool });
    }
  });

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const handleSubmit = (text: string): void => {
    if (text === '/exit' || text === '/quit') {
      exit();
      return;
    }
    if (text === '/clear') {
      dispatch({ type: 'clear_session' });
      return;
    }
    dispatch({ type: 'user_submit', id: `usr-${String(Date.now())}`, text });
    const ac = new AbortController();
    abortRef.current = ac;

    void props.onSendTurn(
      text,
      (event) => {
        dispatch({ type: 'agent_event', event });
      },
      (callId) =>
        new Promise<PermissionAnswer>((resolve) => {
          permResolvers.current.set(callId, resolve);
        }),
      ac.signal,
    );
  };

  const handlePermissionAnswer = (answer: PermissionAnswer): void => {
    const req = state.pendingPermission;
    if (!req) return;
    const resolver = permResolvers.current.get(req.callId);
    permResolvers.current.delete(req.callId);
    resolver?.(answer);
  };

  const cycleMode = (): void => {
    const idx = MODE_CYCLE.indexOf(state.mode);
    const next = MODE_CYCLE[(idx + 1) % MODE_CYCLE.length] ?? 'default';
    dispatch({ type: 'set_mode', mode: next });
    props.onModeChange?.(next);
  };

  return (
    <ThemeProvider
      theme={props.theme ?? REENGINE_DARK}
      colorDepth={props.colorDepth ?? 'truecolor'}
      plain={props.plain ?? false}
    >
      <Box flexDirection="column">
        <Static items={state.staticItems}>
          {(item) => {
            if (item.kind === 'banner') {
              return <BrandLogo key={item.id} banner={item.text} />;
            }
            if (item.kind === 'user') {
              return (
                <Box key={item.id} marginTop={1}>
                  <Text bold>▍You </Text>
                  <Text>{sanitizeTerminalText(item.text)}</Text>
                </Box>
              );
            }
            if (item.kind === 'assistant') {
              return (
                <Box key={item.id} flexDirection="column" marginTop={1}>
                  <Text bold>◆ ReEngine</Text>
                  <Markdown text={item.text} />
                </Box>
              );
            }
            if (item.kind === 'tool') {
              return (
                <ToolCard
                  key={item.id}
                  tool={item.tool}
                  summary={item.summary}
                  isError={item.isError}
                  durationMs={item.durationMs}
                  preview={item.preview}
                  artifactId={item.artifactId}
                  evidence={item.evidence}
                />
              );
            }
            return (
              <Text key={item.id} dimColor>
                [{item.level}] {sanitizeTerminalText(item.message)}
              </Text>
            );
          }}
        </Static>

        {state.streamingText ? (
          <Box flexDirection="column" marginTop={1}>
            <Text bold>◆ ReEngine</Text>
            <Text>{sanitizeTerminalText(state.streamingText)}▌</Text>
          </Box>
        ) : null}

        {state.activeTools.map((t) => (
          <Text key={t.callId} dimColor>
            ⠋ {sanitizeTerminalText(t.tool)} {sanitizeTerminalText(t.summary)}
          </Text>
        ))}

        {state.pendingPermission ? (
          <PermissionPrompt request={state.pendingPermission} onAnswer={handlePermissionAnswer} />
        ) : null}

        {state.inspectorOpen ? <Inspector state={state} /> : null}
        {state.detailItem?.kind === 'tool' ? (
          <DetailViewer
            item={state.detailItem}
            onClose={() => {
              dispatch({ type: 'open_detail', item: null });
            }}
          />
        ) : null}
        {state.helpOpen ? (
          <HelpOverlay
            onClose={() => {
              dispatch({ type: 'toggle_help' });
            }}
          />
        ) : null}

        <Composer
          isRunning={state.isRunning}
          disabled={Boolean(state.pendingPermission || state.helpOpen || state.detailItem)}
          onSubmit={handleSubmit}
          onCancel={() => {
            abortRef.current?.abort();
          }}
          onCycleMode={cycleMode}
          onToggleInspector={() => {
            dispatch({ type: 'toggle_inspector' });
          }}
          onToggleHelp={() => {
            dispatch({ type: 'toggle_help' });
          }}
          onExit={() => {
            exit();
          }}
        />

        <StatusBar
          mode={state.mode}
          model={state.model}
          contextTokens={state.contextTokens}
          contextWindow={state.contextWindow}
          engine={state.engine}
          cwd={state.cwd}
        />
      </Box>
    </ThemeProvider>
  );
}
