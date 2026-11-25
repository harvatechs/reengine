export type ColorDepth = 'truecolor' | '256' | '16' | 'none';

export interface TerminalCapabilities {
  isTTY: boolean;
  colorDepth: ColorDepth;
  unicode: boolean;
  columns: number;
  rows: number;
  emulator: string;
}

export function detectTerminalEmulator(env: NodeJS.ProcessEnv = process.env): string {
  if (env.WT_SESSION) return 'windows-terminal';
  if (env.TERM_PROGRAM === 'ghostty') return 'ghostty';
  if (env.TERM_PROGRAM === 'WezTerm') return 'wezterm';
  if (env.TERM_PROGRAM === 'iTerm.app') return 'iterm2';
  if (env.KITTY_WINDOW_ID) return 'kitty';
  if (env.TERM_PROGRAM === 'vscode') return 'vscode';
  if (env.TERM_PROGRAM === 'Apple_Terminal') return 'apple-terminal';
  return env.TERM || 'unknown';
}

export function detectColorDepth(
  env: NodeJS.ProcessEnv = process.env,
  isTTY: boolean = process.stdout.isTTY,
): ColorDepth {
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== '') {
    return 'none';
  }
  if (!isTTY && env.FORCE_COLOR === undefined) {
    return 'none';
  }
  if (env.FORCE_COLOR === '0') {
    return 'none';
  }
  const colorTerm = (env.COLORTERM ?? '').toLowerCase();
  if (colorTerm === 'truecolor' || colorTerm === '24bit' || env.WT_SESSION) {
    return 'truecolor';
  }
  const term = (env.TERM ?? '').toLowerCase();
  if (term.includes('256color')) {
    return '256';
  }
  if (term === 'dumb') {
    return 'none';
  }
  return '16';
}

export function detectTerminalCapabilities(
  env: NodeJS.ProcessEnv = process.env,
): TerminalCapabilities {
  const isTTY = process.stdout.isTTY;
  const lang = `${env.LANG ?? ''}${env.LC_ALL ?? ''}${env.LC_CTYPE ?? ''}`.toUpperCase();
  const unicode =
    process.platform === 'win32'
      ? Boolean(env.WT_SESSION || env.TERM_PROGRAM || env.ConEmuANSI === 'ON')
      : lang.includes('UTF-8') || lang.includes('UTF8');

  return {
    isTTY,
    colorDepth: detectColorDepth(env, isTTY),
    unicode,
    columns: process.stdout.columns || 80,
    rows: process.stdout.rows || 24,
    emulator: detectTerminalEmulator(env),
  };
}

export const TERMINAL_RESTORE_SEQUENCE = '\x1b[?25h\x1b[?2004l\x1b[?1049l';

export function restoreTerminalState(
  write: (chunk: string) => void = (c) => {
    process.stdout.write(c);
  },
): void {
  if (process.stdin.isTTY && typeof process.stdin.setRawMode === 'function') {
    try {
      process.stdin.setRawMode(false);
    } catch {
      // Ignore if stream already closed
    }
  }
  try {
    write(TERMINAL_RESTORE_SEQUENCE);
  } catch {
    // Ignore write failures on teardown
  }
}
