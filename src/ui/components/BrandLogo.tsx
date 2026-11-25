import { Box, Text } from 'ink';
import { sanitizeTerminalText } from '../sanitize.js';
import { adaptColorForDepth } from '../theme/ansi-map.js';
import {
  BRAND_LOGO_ASCII_ROWS,
  BRAND_LOGO_PIXEL_ROWS,
  getBrandLogoRowColor,
} from '../theme/brand-logo.js';
import { useTheme } from '../theme/context.js';

export function BrandLogo({ banner }: { banner: string }) {
  const { theme, colorDepth, plain, colorProp } = useTheme();
  const rows = plain ? BRAND_LOGO_ASCII_ROWS : BRAND_LOGO_PIXEL_ROWS;

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box flexDirection="column">
        {rows.map((row, idx) => {
          const rowColor = plain
            ? undefined
            : adaptColorForDepth(getBrandLogoRowColor(idx), colorDepth);
          return (
            <Text key={idx} {...(rowColor ? { color: rowColor } : {})}>
              {row}
            </Text>
          );
        })}
      </Box>
      <Box marginTop={1}>
        <Text {...colorProp(theme.colors.text.primary)}>Welcome to </Text>
        <Text {...colorProp(theme.colors.brand.accent)} bold>
          ReEngine CLI
        </Text>
        <Text {...colorProp(theme.colors.text.primary)}>!</Text>
      </Box>
      <Text {...colorProp(theme.colors.text.muted)} dimColor>
        {sanitizeTerminalText(banner)}
      </Text>
    </Box>
  );
}
