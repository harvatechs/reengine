import * as fs from 'node:fs';
import * as path from 'node:path';
import { ConfigError } from '../../util/index.js';
import { ThemeSchema, type ThemeDefinition } from './schema.js';

const BASE_STYLES = { emphasis: 'bold', heading: 'bold', link: 'underline', muted: 'dim' } as const;

export const REENGINE_DARK: ThemeDefinition = {
  version: 1,
  name: 'reengine-dark',
  surfaceBackground: '#0B0D12',
  colors: {
    text: { primary: '#E6E6E6', muted: '#9AA1AE', dim: '#667085', inverse: '#0B0D12' },
    brand: { accent: '#7AA2F7', accentAlt: '#BB9AF7' },
    status: { success: '#9ECE6A', warning: '#E0AF68', danger: '#F7768E', info: '#7DCFFF' },
    surface: {
      border: '#3B4252',
      borderFocus: '#7AA2F7',
      codeBg: '#161821',
      selectionBg: '#2A3150',
    },
    chat: { user: '#7DCFFF', assistant: '#E6E6E6', system: '#9AA1AE', reasoning: '#667085' },
    tool: {
      name: '#BB9AF7',
      pending: '#9AA1AE',
      running: '#E0AF68',
      success: '#9ECE6A',
      error: '#F7768E',
    },
    diff: {
      add: '#9ECE6A',
      remove: '#F7768E',
      addBg: '#1B2A1D',
      removeBg: '#2D1D22',
      hunk: '#7DCFFF',
    },
    syntax: {
      keyword: '#BB9AF7',
      string: '#9ECE6A',
      number: '#FF9E64',
      comment: '#667085',
      function: '#7AA2F7',
      type: '#2AC3DE',
      operator: '#89DDFF',
      variable: '#E6E6E6',
      punctuation: '#9AA1AE',
    },
    asm: {
      address: '#E0AF68',
      bytes: '#667085',
      mnemonic: '#7AA2F7',
      register: '#BB9AF7',
      immediate: '#FF9E64',
      label: '#2AC3DE',
      string: '#9ECE6A',
      comment: '#667085',
    },
    evidence: { accent: '#2AC3DE', observed: '#9ECE6A', inferred: '#E0AF68', unknown: '#9AA1AE' },
    link: '#7DCFFF',
  },
  textStyles: { ...BASE_STYLES },
};

export const REENGINE_LIGHT: ThemeDefinition = {
  version: 1,
  name: 'reengine-light',
  surfaceBackground: '#FFFFFF',
  colors: {
    text: { primary: '#1F2328', muted: '#59636E', dim: '#818B98', inverse: '#FFFFFF' },
    brand: { accent: '#0550AE', accentAlt: '#8250DF' },
    status: { success: '#1A7F37', warning: '#9A6700', danger: '#CF222E', info: '#0969DA' },
    surface: {
      border: '#D0D7DE',
      borderFocus: '#0550AE',
      codeBg: '#F6F8FA',
      selectionBg: '#DDF4FF',
    },
    chat: { user: '#0550AE', assistant: '#1F2328', system: '#59636E', reasoning: '#818B98' },
    tool: {
      name: '#8250DF',
      pending: '#59636E',
      running: '#9A6700',
      success: '#1A7F37',
      error: '#CF222E',
    },
    diff: {
      add: '#1A7F37',
      remove: '#CF222E',
      addBg: '#DAFBE1',
      removeBg: '#FFEBE9',
      hunk: '#0969DA',
    },
    syntax: {
      keyword: '#8250DF',
      string: '#1A7F37',
      number: '#BC4C00',
      comment: '#818B98',
      function: '#0550AE',
      type: '#0A7B83',
      operator: '#0969DA',
      variable: '#1F2328',
      punctuation: '#59636E',
    },
    asm: {
      address: '#9A6700',
      bytes: '#818B98',
      mnemonic: '#0550AE',
      register: '#8250DF',
      immediate: '#BC4C00',
      label: '#0A7B83',
      string: '#1A7F37',
      comment: '#818B98',
    },
    evidence: { accent: '#0A7B83', observed: '#1A7F37', inferred: '#9A6700', unknown: '#59636E' },
    link: '#0969DA',
  },
  textStyles: { ...BASE_STYLES },
};

export const HIGH_CONTRAST: ThemeDefinition = {
  version: 1,
  name: 'high-contrast',
  surfaceBackground: '#000000',
  colors: {
    text: { primary: '#FFFFFF', muted: '#D4D4D4', dim: '#A6A6A6', inverse: '#000000' },
    brand: { accent: '#00FFFF', accentAlt: '#FF00FF' },
    status: { success: '#00FF00', warning: '#FFFF00', danger: '#FF5555', info: '#00FFFF' },
    surface: {
      border: '#FFFFFF',
      borderFocus: '#00FFFF',
      codeBg: '#0A0A0A',
      selectionBg: '#264F78',
    },
    chat: { user: '#00FFFF', assistant: '#FFFFFF', system: '#D4D4D4', reasoning: '#A6A6A6' },
    tool: {
      name: '#FF00FF',
      pending: '#D4D4D4',
      running: '#FFFF00',
      success: '#00FF00',
      error: '#FF5555',
    },
    diff: {
      add: '#00FF00',
      remove: '#FF5555',
      addBg: '#003300',
      removeBg: '#330000',
      hunk: '#00FFFF',
    },
    syntax: {
      keyword: '#FF77FF',
      string: '#00FF00',
      number: '#FFFF00',
      comment: '#A6A6A6',
      function: '#00FFFF',
      type: '#55FFFF',
      operator: '#FFFFFF',
      variable: '#FFFFFF',
      punctuation: '#D4D4D4',
    },
    asm: {
      address: '#FFFF00',
      bytes: '#A6A6A6',
      mnemonic: '#00FFFF',
      register: '#FF77FF',
      immediate: '#FFFF00',
      label: '#55FFFF',
      string: '#00FF00',
      comment: '#A6A6A6',
    },
    evidence: { accent: '#00FFFF', observed: '#00FF00', inferred: '#FFFF00', unknown: '#D4D4D4' },
    link: '#00FFFF',
  },
  textStyles: { ...BASE_STYLES },
};

export const MONO_THEME: ThemeDefinition = {
  version: 1,
  name: 'mono',
  surfaceBackground: '#000000',
  colors: {
    text: {
      primary: 'ansi:white',
      muted: 'ansi:brightBlack',
      dim: 'ansi:brightBlack',
      inverse: 'ansi:black',
    },
    brand: { accent: 'ansi:brightWhite', accentAlt: 'ansi:white' },
    status: {
      success: 'ansi:brightWhite',
      warning: 'ansi:white',
      danger: 'ansi:brightWhite',
      info: 'ansi:white',
    },
    surface: {
      border: 'ansi:brightBlack',
      borderFocus: 'ansi:brightWhite',
      codeBg: 'inherit',
      selectionBg: 'ansi:brightBlack',
    },
    chat: {
      user: 'ansi:brightWhite',
      assistant: 'ansi:white',
      system: 'ansi:brightBlack',
      reasoning: 'ansi:brightBlack',
    },
    tool: {
      name: 'ansi:brightWhite',
      pending: 'ansi:brightBlack',
      running: 'ansi:white',
      success: 'ansi:brightWhite',
      error: 'ansi:brightWhite',
    },
    diff: {
      add: 'ansi:brightWhite',
      remove: 'ansi:white',
      addBg: 'inherit',
      removeBg: 'inherit',
      hunk: 'ansi:brightWhite',
    },
    syntax: {
      keyword: 'ansi:brightWhite',
      string: 'ansi:white',
      number: 'ansi:brightWhite',
      comment: 'ansi:brightBlack',
      function: 'ansi:brightWhite',
      type: 'ansi:white',
      operator: 'ansi:white',
      variable: 'ansi:white',
      punctuation: 'ansi:brightBlack',
    },
    asm: {
      address: 'ansi:brightBlack',
      bytes: 'ansi:brightBlack',
      mnemonic: 'ansi:brightWhite',
      register: 'ansi:white',
      immediate: 'ansi:brightWhite',
      label: 'ansi:white',
      string: 'ansi:white',
      comment: 'ansi:brightBlack',
    },
    evidence: {
      accent: 'ansi:brightWhite',
      observed: 'ansi:brightWhite',
      inferred: 'ansi:white',
      unknown: 'ansi:brightBlack',
    },
    link: 'ansi:brightWhite',
  },
  textStyles: { ...BASE_STYLES },
};

export const SOLARIZED_THEME: ThemeDefinition = {
  version: 1,
  name: 'solarized',
  surfaceBackground: '#002B36',
  colors: {
    text: { primary: '#93A1A1', muted: '#657B83', dim: '#586E75', inverse: '#002B36' },
    brand: { accent: '#268BD2', accentAlt: '#6C71C4' },
    status: { success: '#859900', warning: '#B58900', danger: '#DC322F', info: '#2AA198' },
    surface: {
      border: '#073642',
      borderFocus: '#268BD2',
      codeBg: '#073642',
      selectionBg: '#073642',
    },
    chat: { user: '#2AA198', assistant: '#93A1A1', system: '#657B83', reasoning: '#586E75' },
    tool: {
      name: '#6C71C4',
      pending: '#657B83',
      running: '#B58900',
      success: '#859900',
      error: '#DC322F',
    },
    diff: {
      add: '#859900',
      remove: '#DC322F',
      addBg: '#073642',
      removeBg: '#2D1519',
      hunk: '#268BD2',
    },
    syntax: {
      keyword: '#859900',
      string: '#2AA198',
      number: '#D33682',
      comment: '#586E75',
      function: '#268BD2',
      type: '#B58900',
      operator: '#93A1A1',
      variable: '#839496',
      punctuation: '#657B83',
    },
    asm: {
      address: '#B58900',
      bytes: '#586E75',
      mnemonic: '#268BD2',
      register: '#6C71C4',
      immediate: '#D33682',
      label: '#2AA198',
      string: '#859900',
      comment: '#586E75',
    },
    evidence: { accent: '#2AA198', observed: '#859900', inferred: '#B58900', unknown: '#657B83' },
    link: '#268BD2',
  },
  textStyles: { ...BASE_STYLES },
};

export const BUILTIN_THEMES: Record<string, ThemeDefinition> = {
  'reengine-dark': REENGINE_DARK,
  'reengine-light': REENGINE_LIGHT,
  'high-contrast': HIGH_CONTRAST,
  mono: MONO_THEME,
  solarized: SOLARIZED_THEME,
};

function mergePlain(
  base: Record<string, unknown>,
  over: Record<string, unknown>,
): Record<string, unknown> {
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) {
    if (v === undefined) continue;
    const prev = out[k];
    if (
      typeof prev === 'object' &&
      prev !== null &&
      typeof v === 'object' &&
      v !== null &&
      !Array.isArray(v)
    ) {
      out[k] = mergePlain(prev as Record<string, unknown>, v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export function resolveTheme(
  name: string,
  colorOverrides: Record<string, unknown> = {},
  userThemesDir?: string,
): ThemeDefinition {
  const builtin = BUILTIN_THEMES[name];
  let raw: Record<string, unknown> | undefined = builtin ? builtin : undefined;
  if (!raw && userThemesDir) {
    const file = path.join(userThemesDir, `${name}.json`);
    if (fs.existsSync(file)) {
      raw = JSON.parse(fs.readFileSync(file, 'utf-8')) as Record<string, unknown>;
    }
  }
  if (!raw) {
    throw new ConfigError('THEME_NOT_FOUND', `Theme "${name}" not found.`);
  }
  if (typeof raw.extends === 'string' && raw.extends !== name) {
    const parent = resolveTheme(raw.extends, {}, userThemesDir);
    raw = mergePlain(parent, raw);
  }
  if (Object.keys(colorOverrides).length > 0) {
    raw = mergePlain(raw, { colors: colorOverrides });
  }
  return ThemeSchema.parse(raw);
}
