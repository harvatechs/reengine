import stringWidth from 'string-width';
import wrapAnsi from 'wrap-ansi';

const ANSI_ESCAPE_RE =
  /\u001B(?:\][^\u0007\u001B]*(?:\u0007|\u001B\\)|\[[0-?]*[ -/]*[@-~]|[PX^_][^\u001B]*\u001B\\|[@-Z\\-_])/g;

const CONTROL_CHARS_RE = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g;

export function sanitizeTerminalText(text: string): string {
  return text.replace(ANSI_ESCAPE_RE, '').replace(CONTROL_CHARS_RE, '');
}

export function measureDisplayWidth(text: string): number {
  return stringWidth(text);
}

export function wrapTerminalText(text: string, columns: number): string {
  const safeCols = Math.max(20, columns);
  return wrapAnsi(text, safeCols, { hard: true, trim: false });
}

export function formatOsc8Link(label: string, url: string): string {
  try {
    const parsed = new URL(url);
    if (
      parsed.protocol === 'http:' ||
      parsed.protocol === 'https:' ||
      parsed.protocol === 'file:' ||
      parsed.protocol === 'mailto:'
    ) {
      return `\u001B]8;;${parsed.toString()}\u0007${sanitizeTerminalText(label)}\u001B]8;;\u0007`;
    }
  } catch {
    // Invalid URL falls back to plain label
  }
  return sanitizeTerminalText(label);
}
