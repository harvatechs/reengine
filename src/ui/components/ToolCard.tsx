import { Box, Text } from 'ink';
import type { EvidenceRecord } from '../../core/contracts.js';
import { sanitizeTerminalText } from '../sanitize.js';
import { useTheme } from '../theme/context.js';
import { EvidenceBadge } from './EvidenceBadge.js';

export function ToolCard({
  tool,
  summary,
  isError,
  durationMs,
  preview,
  artifactId,
  evidence,
  previewLines = 8,
}: {
  tool: string;
  summary: string;
  isError: boolean;
  durationMs: number;
  preview: string;
  artifactId?: string | undefined;
  evidence: EvidenceRecord[];
  previewLines?: number;
}) {
  const { theme, colorProp } = useTheme();
  const statusProp = isError
    ? colorProp(theme.colors.tool.error)
    : colorProp(theme.colors.tool.success);
  const icon = isError ? '✗' : '✓';
  const lines = sanitizeTerminalText(preview).split('\n').slice(0, previewLines);

  return (
    <Box flexDirection="column" marginY={0} paddingLeft={1}>
      <Box justifyContent="space-between">
        <Text>
          <Text {...statusProp}>{icon} </Text>
          <Text {...colorProp(theme.colors.tool.name)} bold>
            {sanitizeTerminalText(tool)}
          </Text>
          <Text {...colorProp(theme.colors.text.muted)}> {sanitizeTerminalText(summary)}</Text>
        </Text>
        <Text {...colorProp(theme.colors.text.dim)} dimColor>
          {(durationMs / 1000).toFixed(1)}s{artifactId ? ` [art:${artifactId.slice(0, 8)}]` : ''}
        </Text>
      </Box>
      {lines.length > 0 && lines[0] !== '' ? (
        <Box flexDirection="column" paddingLeft={2}>
          {lines.map((l, i) => (
            <Text key={i} {...colorProp(theme.colors.text.dim)} dimColor>
              {l}
            </Text>
          ))}
        </Box>
      ) : null}
      {evidence.length > 0 ? (
        <Box flexDirection="column" paddingLeft={2}>
          {evidence.slice(0, 3).map((ev) => (
            <EvidenceBadge key={ev.id} record={ev} />
          ))}
        </Box>
      ) : null}
    </Box>
  );
}
