import { Box, Text } from 'ink';
import type { EvidenceRecord, EvidenceStatus } from '../../core/contracts.js';
import { sanitizeTerminalText } from '../sanitize.js';
import { useTheme } from '../theme/context.js';

function statusGlyph(status: EvidenceStatus): string {
  if (status === 'observed') return '✓';
  if (status === 'inferred') return '~';
  return '?';
}

export function EvidenceBadge({ record }: { record: EvidenceRecord }) {
  const { theme, colorProp } = useTheme();
  return (
    <Text {...colorProp(theme.colors.evidence[record.status])}>
      {statusGlyph(record.status)} {record.status}: {sanitizeTerminalText(record.title)}
    </Text>
  );
}

export function EvidenceList({ records }: { records: EvidenceRecord[] }) {
  const { theme, colorProp } = useTheme();
  if (records.length === 0) {
    return (
      <Text {...colorProp(theme.colors.text.dim)} dimColor>
        No evidence records captured yet.
      </Text>
    );
  }
  return (
    <Box flexDirection="column">
      {records.slice(0, 15).map((r) => (
        <Box key={r.id} flexDirection="column">
          <EvidenceBadge record={r} />
          {r.limitations && r.limitations.length > 0 ? (
            <Text {...colorProp(theme.colors.text.dim)} dimColor>
              {'  '}limit: {sanitizeTerminalText(r.limitations[0] ?? '')}
            </Text>
          ) : null}
        </Box>
      ))}
    </Box>
  );
}
