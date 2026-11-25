import { Box, Text } from 'ink';
import type { PermissionMode } from '../../core/contracts.js';
import { sanitizeTerminalText } from '../sanitize.js';
import type { InspectorEngineView } from '../store.js';
import { useTheme } from '../theme/context.js';

export function StatusBar({
  mode,
  model,
  contextTokens,
  contextWindow,
  engine,
  cwd,
}: {
  mode: PermissionMode;
  model: string;
  contextTokens: number;
  contextWindow: number;
  engine: InspectorEngineView;
  cwd: string;
}) {
  const { theme, colorProp, boxBorder } = useTheme();
  const pct =
    contextWindow > 0 ? Math.min(100, Math.round((contextTokens / contextWindow) * 100)) : 0;
  const engineDot = engine.state === 'ready' ? '●' : engine.state === 'starting' ? '◐' : '✕';
  const engineToken =
    engine.state === 'ready'
      ? theme.colors.status.success
      : engine.state === 'starting'
        ? theme.colors.status.warning
        : theme.colors.status.danger;

  return (
    <Box
      {...boxBorder(theme.colors.surface.border, 'single')}
      paddingX={1}
      justifyContent="space-between"
    >
      <Text>
        <Text {...colorProp(theme.colors.brand.accent)} bold>
          {mode}
        </Text>
        <Text {...colorProp(theme.colors.text.dim)}> │ </Text>
        <Text {...colorProp(theme.colors.text.primary)}>{sanitizeTerminalText(model)}</Text>
        <Text {...colorProp(theme.colors.text.dim)}> │ </Text>
        <Text {...colorProp(theme.colors.text.muted)}>ctx {String(pct)}%</Text>
        <Text {...colorProp(theme.colors.text.dim)}> │ </Text>
        <Text {...colorProp(engineToken)}>
          REA {engineDot} {engine.provider}
        </Text>
      </Text>
      <Text {...colorProp(theme.colors.text.dim)} dimColor>
        {sanitizeTerminalText(cwd)}
      </Text>
    </Box>
  );
}
