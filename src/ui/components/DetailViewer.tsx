import { Box, Text, useInput } from 'ink';
import { sanitizeTerminalText } from '../sanitize.js';
import type { TranscriptItem } from '../store.js';
import { useTheme } from '../theme/context.js';

export function DetailViewer({
  item,
  onClose,
}: {
  item: Extract<TranscriptItem, { kind: 'tool' }>;
  onClose: () => void;
}) {
  const { theme, colorProp, boxBorder } = useTheme();
  useInput((_input, key) => {
    if (key.escape) onClose();
  });

  return (
    <Box flexDirection="column" {...boxBorder(theme.colors.brand.accent, 'double')} paddingX={1}>
      <Text {...colorProp(theme.colors.brand.accent)} bold>
        Detail Viewer: {sanitizeTerminalText(item.tool)} (Esc to close)
      </Text>
      <Text {...colorProp(theme.colors.text.primary)}>{sanitizeTerminalText(item.preview)}</Text>
    </Box>
  );
}

export function HelpOverlay({ onClose }: { onClose: () => void }) {
  const { theme, colorProp, boxBorder } = useTheme();
  useInput((_input, key) => {
    if (key.escape || key.return) onClose();
  });

  return (
    <Box flexDirection="column" {...boxBorder(theme.colors.brand.accent, 'round')} paddingX={1}>
      <Text {...colorProp(theme.colors.brand.accent)} bold>
        ReEngine CLI Keybindings & Commands (Esc to close)
      </Text>
      <Text {...colorProp(theme.colors.text.primary)}>
        Enter: send · Esc / Ctrl+C: cancel · Shift+Tab: cycle mode · Ctrl+G: inspector · Ctrl+O:
        detail
      </Text>
      <Text {...colorProp(theme.colors.text.muted)}>
        Commands: /help · /model · /theme · /engine · /targets · /evidence · /report · /compact ·
        /clear · /exit
      </Text>
    </Box>
  );
}
