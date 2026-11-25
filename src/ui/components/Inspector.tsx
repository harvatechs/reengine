import { Box, Text } from 'ink';
import { sanitizeTerminalText } from '../sanitize.js';
import type { UiState } from '../store.js';
import { useTheme } from '../theme/context.js';
import { EvidenceList } from './EvidenceBadge.js';

export function Inspector({ state }: { state: UiState }) {
  const { theme, colorProp, boxBorder } = useTheme();

  return (
    <Box flexDirection="column" {...boxBorder(theme.colors.surface.border, 'single')} paddingX={1}>
      <Text {...colorProp(theme.colors.brand.accent)} bold>
        Inspector (Ctrl+G to close)
      </Text>
      <Text {...colorProp(theme.colors.text.primary)}>
        Engine: REA {state.engine.state} ({state.engine.version ?? 'bundled'}) · provider:{' '}
        {state.engine.provider}
      </Text>
      <Text {...colorProp(theme.colors.text.muted)}>
        Targets:{' '}
        {state.targets.length > 0 ? state.targets.map(sanitizeTerminalText).join(', ') : '(none)'}
      </Text>
      <Text {...colorProp(theme.colors.text.muted)}>
        Usage: in={String(state.usage.inputTokens)} out={String(state.usage.outputTokens)}
      </Text>
      <Box marginTop={1} flexDirection="column">
        <Text {...colorProp(theme.colors.evidence.accent)} bold>
          Evidence ({String(state.evidence.length)})
        </Text>
        <EvidenceList records={state.evidence} />
      </Box>
    </Box>
  );
}
