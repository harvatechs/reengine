import { describe, expect, it } from 'vitest';
import {
  BUILTIN_THEMES,
  exportThemeForTerminal,
  loadKeybindings,
  measureDisplayWidth,
  resolveTheme,
  sanitizeTerminalText,
  tokenizeAsmLine,
  validateKeybindingsMap,
  validateThemeContrast,
  wrapTerminalText,
} from '../../../src/ui/index.js';
import { ConfigError } from '../../../src/util/index.js';

describe('src/ui themes, exporters, sanitize, keybindings, asm tokenizer (P5/P6)', () => {
  it('validates all 5 built-in themes and WCAG contrast', () => {
    const names = ['reengine-dark', 'reengine-light', 'high-contrast', 'mono', 'solarized'];
    for (const n of names) {
      const t = resolveTheme(n);
      expect(BUILTIN_THEMES[n]).toBeDefined();
      const contrast = validateThemeContrast(t);
      expect(contrast.ok, `Theme ${n} failed primary contrast`).toBe(true);
    }
  });

  it('exports all 7 terminal formats', () => {
    const t = resolveTheme('reengine-dark');
    const terminals = [
      'kitty',
      'wezterm',
      'alacritty',
      'ghostty',
      'iterm2',
      'windows-terminal',
      'vscode',
    ] as const;
    for (const term of terminals) {
      const out = exportThemeForTerminal(term, t, { fontFamily: 'JetBrains Mono', fontSize: 13 });
      expect(out.content.length).toBeGreaterThan(20);
      expect(out.installHint.length).toBeGreaterThan(10);
    }
  });

  it('strips ANSI escapes and C0/C1 control sequences from untrusted text', () => {
    const malicious = 'ok\u001B[31mred\u001B[0m\u001B]52;c;ZXZpbA==\u0007\u0008!';
    expect(sanitizeTerminalText(malicious)).toBe('okred!');
    expect(measureDisplayWidth('ok')).toBe(2);
    expect(wrapTerminalText('hello world testing wrap', 10).split('\n').length).toBeGreaterThan(1);
  });

  it('rejects reserved keybinding collisions and tokenizes assembly lines', () => {
    expect(() => {
      validateKeybindingsMap({ submit: ['ctrl+m'] });
    }).toThrowError(ConfigError);
    expect(() => {
      validateKeybindingsMap({ complete: ['ctrl+i'] });
    }).toThrowError(ConfigError);
    expect(loadKeybindings('/nonexistent/keybindings.json').toggleInspector).toEqual(['ctrl+g']);

    const toks = tokenizeAsmLine('0x401000: mov rax, 0x10 ; load imm');
    expect(toks.some((t) => t.kind === 'address')).toBe(true);
    expect(toks.some((t) => t.kind === 'mnemonic')).toBe(true);
    expect(toks.some((t) => t.kind === 'register')).toBe(true);
    expect(toks.some((t) => t.kind === 'immediate')).toBe(true);
    expect(toks.some((t) => t.kind === 'comment')).toBe(true);
  });
});
