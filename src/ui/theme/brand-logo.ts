import type { ColorDepth } from '../../platform/index.js';
import { adaptColorForDepth } from './ansi-map.js';

export const BRAND_LOGO_PRIMARY_HEX = '#B91C3B';
export const BRAND_LOGO_SHADOW_HEX = '#8A1A2C';

export const BRAND_LOGO_PIXEL_ROWS: readonly string[] = [
  '     ▄████   ███        ',
  '   ▄▄▄██▀▀▀▀▀  ██▄ ▀▄   ',
  ' ▄████████          ███ ',
  ' ██▀▀▀▀             ▄▄▄█',
  '    █████          ████ ',
  '  ▄██████   ▄▄▄   ███▄▄ ',
  '   ▀████  ▄██████▀▀▀▀▀  ',
  '      ▀    ▀█████       ',
];

export const BRAND_LOGO_ASCII_ROWS: readonly string[] = [
  '     .####   ###        ',
  '   ..###^^^^^  ##. ^.   ',
  ' .########          ### ',
  ' ##^^^^             ...#',
  '    #####          #### ',
  '  .######   ...   ###.. ',
  '   ^####  .######^^^^^  ',
  '      ^    ^#####       ',
];

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.startsWith('#') ? hex.slice(1) : hex;
  return [
    Number.parseInt(h.slice(0, 2), 16),
    Number.parseInt(h.slice(2, 4), 16),
    Number.parseInt(h.slice(4, 6), 16),
  ];
}

export function getBrandLogoRowColor(rowIndex: number): string {
  return rowIndex % 2 === 0 ? BRAND_LOGO_PRIMARY_HEX : BRAND_LOGO_SHADOW_HEX;
}

export function renderBrandLogoAnsi(options: {
  colorDepth?: ColorDepth | undefined;
  unicode?: boolean | undefined;
  plain?: boolean | undefined;
}): string {
  const plain = options.plain ?? false;
  const unicode = options.unicode ?? true;
  const rows = !plain && unicode ? BRAND_LOGO_PIXEL_ROWS : BRAND_LOGO_ASCII_ROWS;
  if (plain || options.colorDepth === 'none') {
    return rows.join('\n') + '\n';
  }
  const colorDepth = options.colorDepth ?? 'truecolor';
  return (
    rows
      .map((line, idx) => {
        const adapted = adaptColorForDepth(getBrandLogoRowColor(idx), colorDepth);
        if (adapted?.startsWith('#')) {
          const [r, g, b] = hexToRgb(adapted);
          return `\u001B[38;2;${String(r)};${String(g)};${String(b)}m${line}\u001B[0m`;
        }
        return `\u001B[31m${line}\u001B[0m`;
      })
      .join('\n') + '\n'
  );
}
