import type { ThemeDefinition } from './schema.js';

function parseHexRgb(hex: string): [number, number, number] | null {
  if (!hex.startsWith('#')) return null;
  const h =
    hex.length === 4
      ? `${hex.charAt(1)}${hex.charAt(1)}${hex.charAt(2)}${hex.charAt(2)}${hex.charAt(3)}${hex.charAt(3)}`
      : hex.slice(1);
  if (h.length !== 6) return null;
  return [
    Number.parseInt(h.slice(0, 2), 16),
    Number.parseInt(h.slice(2, 4), 16),
    Number.parseInt(h.slice(4, 6), 16),
  ];
}

function relLuminance([r, g, b]: [number, number, number]): number {
  const f = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrastRatio(fgHex: string, bgHex: string): number | null {
  const fg = parseHexRgb(fgHex);
  const bg = parseHexRgb(bgHex);
  if (!fg || !bg) return null;
  const l1 = relLuminance(fg);
  const l2 = relLuminance(bg);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

export function validateThemeContrast(theme: ThemeDefinition): {
  ok: boolean;
  checks: Array<{ token: string; ratio: number | null; level: 'pass' | 'warn' | 'fail' }>;
} {
  const bg = theme.surfaceBackground ?? '#000000';
  const pairs: Array<[string, string]> = [
    ['text.primary', theme.colors.text.primary],
    ['text.muted', theme.colors.text.muted],
    ['status.success', theme.colors.status.success],
    ['status.warning', theme.colors.status.warning],
    ['status.danger', theme.colors.status.danger],
    ['evidence.observed', theme.colors.evidence.observed],
  ];
  const checks = pairs.map(([token, fg]) => {
    const ratio = contrastRatio(fg, bg);
    const level: 'pass' | 'warn' | 'fail' =
      ratio === null ? 'pass' : ratio < 3 ? 'fail' : ratio < 4.5 ? 'warn' : 'pass';
    return { token, ratio, level };
  });
  const primaryFailed = checks.some((c) => c.token === 'text.primary' && c.level === 'fail');
  return { ok: !primaryFailed, checks };
}
