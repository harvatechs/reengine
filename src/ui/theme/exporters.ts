import { themeToAnsi16Palette } from './ansi-map.js';
import type { ThemeDefinition } from './schema.js';

export type ExportTerminalKind =
  'kitty' | 'wezterm' | 'alacritty' | 'ghostty' | 'iterm2' | 'windows-terminal' | 'vscode';

export interface TerminalProfileInput {
  fontFamily?: string | undefined;
  fontSize?: number | undefined;
  lineHeight?: number | undefined;
  ligatures?: boolean | undefined;
}

function exportKitty(
  theme: ThemeDefinition,
  pal: ReturnType<typeof themeToAnsi16Palette>,
  profile: TerminalProfileInput,
): { content: string; installHint: string } {
  const lines = [
    `# ReEngine Theme: ${theme.name}`,
    ...(profile.fontFamily ? [`font_family ${profile.fontFamily}`] : []),
    ...(profile.fontSize ? [`font_size ${String(profile.fontSize)}`] : []),
    `foreground ${pal.foreground}`,
    `background ${pal.background}`,
    `cursor ${pal.cursor}`,
    ...pal.colors.map((hex, i) => `color${String(i)} ${hex}`),
  ];
  return {
    content: lines.join('\n') + '\n',
    installHint:
      'Save to ~/.config/kitty/reengine.conf and add `include reengine.conf` in kitty.conf.',
  };
}

export function exportThemeForTerminal(
  terminal: ExportTerminalKind,
  theme: ThemeDefinition,
  profile: TerminalProfileInput = {},
): { content: string; installHint: string } {
  const pal = themeToAnsi16Palette(theme);

  switch (terminal) {
    case 'kitty':
      return exportKitty(theme, pal, profile);
    case 'wezterm': {
      const luaColors = pal.colors.map((h) => `'${h}'`).join(', ');
      return {
        content: `-- ReEngine Theme: ${theme.name}\nreturn {\n  foreground = '${pal.foreground}',\n  background = '${pal.background}',\n  cursor_bg = '${pal.cursor}',\n  ansi = { ${luaColors.split(', ').slice(0, 8).join(', ')} },\n  brights = { ${luaColors.split(', ').slice(8).join(', ')} },\n}\n`,
        installHint: 'Require this table in ~/.wezterm.lua under config.colors.',
      };
    }
    case 'alacritty': {
      const normal = pal.colors.slice(0, 8);
      const bright = pal.colors.slice(8);
      const names = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'];
      const lines = [
        `# ReEngine Theme: ${theme.name}`,
        '[colors.primary]',
        `background = "${pal.background}"`,
        `foreground = "${pal.foreground}"`,
        '[colors.normal]',
        ...names.map((n, i) => `${n} = "${normal[i] ?? '#000000'}"`),
        '[colors.bright]',
        ...names.map((n, i) => `${n} = "${bright[i] ?? '#FFFFFF'}"`),
      ];
      return {
        content: lines.join('\n') + '\n',
        installHint: 'Import in ~/.config/alacritty/alacritty.toml.',
      };
    }
    case 'ghostty': {
      const lines = [
        `# ReEngine Theme: ${theme.name}`,
        ...(profile.fontFamily ? [`font-family = ${profile.fontFamily}`] : []),
        ...(profile.fontSize ? [`font-size = ${String(profile.fontSize)}`] : []),
        `background = ${pal.background}`,
        `foreground = ${pal.foreground}`,
        ...pal.colors.map((hex, i) => `palette = ${String(i)}=${hex}`),
      ];
      return {
        content: lines.join('\n') + '\n',
        installHint: 'Save to ~/.config/ghostty/themes/reengine and set `theme = reengine`.',
      };
    }
    case 'iterm2': {
      const entries = pal.colors
        .map((hex, i) => `  <key>Ansi ${String(i)} Color</key>\n  <string>${hex}</string>`)
        .join('\n');
      return {
        content: `<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0">\n<dict>\n  <key>Background Color</key>\n  <string>${pal.background}</string>\n  <key>Foreground Color</key>\n  <string>${pal.foreground}</string>\n${entries}\n</dict>\n</plist>\n`,
        installHint: 'Import via iTerm2 -> Settings -> Profiles -> Colors -> Color Presets.',
      };
    }
    case 'windows-terminal': {
      const scheme = {
        name: theme.name,
        background: pal.background,
        foreground: pal.foreground,
        cursorColor: pal.cursor,
        black: pal.colors[0],
        red: pal.colors[1],
        green: pal.colors[2],
        yellow: pal.colors[3],
        blue: pal.colors[4],
        purple: pal.colors[5],
        cyan: pal.colors[6],
        white: pal.colors[7],
        brightBlack: pal.colors[8],
        brightRed: pal.colors[9],
        brightGreen: pal.colors[10],
        brightYellow: pal.colors[11],
        brightBlue: pal.colors[12],
        brightPurple: pal.colors[13],
        brightCyan: pal.colors[14],
        brightWhite: pal.colors[15],
      };
      return {
        content: JSON.stringify(scheme, null, 2) + '\n',
        installHint: 'Add to Windows Terminal settings.json under `schemes[]`.',
      };
    }
    case 'vscode': {
      const settings = {
        ...(profile.fontFamily ? { 'terminal.integrated.fontFamily': profile.fontFamily } : {}),
        ...(profile.fontSize ? { 'terminal.integrated.fontSize': profile.fontSize } : {}),
        ...(profile.lineHeight ? { 'terminal.integrated.lineHeight': profile.lineHeight } : {}),
        'workbench.colorCustomizations': {
          'terminal.background': pal.background,
          'terminal.foreground': pal.foreground,
          'terminal.ansiBlack': pal.colors[0],
          'terminal.ansiRed': pal.colors[1],
          'terminal.ansiGreen': pal.colors[2],
          'terminal.ansiYellow': pal.colors[3],
          'terminal.ansiBlue': pal.colors[4],
          'terminal.ansiMagenta': pal.colors[5],
          'terminal.ansiCyan': pal.colors[6],
          'terminal.ansiWhite': pal.colors[7],
        },
      };
      return {
        content: JSON.stringify(settings, null, 2) + '\n',
        installHint: 'Merge into VS Code User settings.json.',
      };
    }
  }
}
