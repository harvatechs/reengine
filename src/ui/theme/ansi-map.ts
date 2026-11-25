import type { ColorDepth } from '../../platform/index.js';
import type { ThemeDefinition } from './schema.js';

export interface Ansi16Palette {
  foreground: string;
  background: string;
  cursor: string;
  colors: string[]; // 16 slots: 0..15
}

const ANSI_NAME_TO_HEX: Record<string, string> = {
  black: '#000000',
  red: '#CD3131',
  green: '#0DBC79',
  yellow: '#E5E510',
  blue: '#2472C8',
  magenta: '#BC3FBC',
  cyan: '#11A8CD',
  white: '#E5E5E5',
  brightBlack: '#666666',
  brightRed: '#F14C4C',
  brightGreen: '#23D18B',
  brightYellow: '#F5F543',
  brightBlue: '#3B8EEA',
  brightMagenta: '#D670D6',
  brightCyan: '#29B8DB',
  brightWhite: '#FFFFFF',
};

export function resolveColorToHex(token: string, fallback = '#E6E6E6'): string {
  if (token.startsWith('#')) {
    if (token.length === 4) {
      const r = token.charAt(1);
      const g = token.charAt(2);
      const b = token.charAt(3);
      return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
    }
    return token.toUpperCase();
  }
  if (token.startsWith('ansi:')) {
    return ANSI_NAME_TO_HEX[token.slice(5)] ?? fallback;
  }
  return fallback;
}

export function themeToAnsi16Palette(theme: ThemeDefinition): Ansi16Palette {
  const c = theme.colors;
  const bg = resolveColorToHex(theme.surfaceBackground ?? c.text.inverse, '#0B0D12');
  const fg = resolveColorToHex(c.text.primary, '#E6E6E6');
  return {
    foreground: fg,
    background: bg,
    cursor: resolveColorToHex(c.brand.accent, fg),
    colors: [
      bg,
      resolveColorToHex(c.status.danger, '#F7768E'),
      resolveColorToHex(c.status.success, '#9ECE6A'),
      resolveColorToHex(c.status.warning, '#E0AF68'),
      resolveColorToHex(c.brand.accent, '#7AA2F7'),
      resolveColorToHex(c.brand.accentAlt, '#BB9AF7'),
      resolveColorToHex(c.evidence.accent, '#2AC3DE'),
      resolveColorToHex(c.text.muted, '#9AA1AE'),
      resolveColorToHex(c.surface.border, '#3B4252'),
      resolveColorToHex(c.status.danger, '#F7768E'),
      resolveColorToHex(c.status.success, '#9ECE6A'),
      resolveColorToHex(c.status.warning, '#E0AF68'),
      resolveColorToHex(c.status.info, '#7DCFFF'),
      resolveColorToHex(c.tool.name, '#BB9AF7'),
      resolveColorToHex(c.link, '#7DCFFF'),
      fg,
    ],
  };
}

export function adaptColorForDepth(token: string, depth: ColorDepth): string | undefined {
  if (depth === 'none' || token === 'inherit') return undefined;
  if (depth === 'truecolor') return token;
  if (token.startsWith('ansi:')) return token.slice(5);
  return token;
}
