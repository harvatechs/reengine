import type { Command } from 'commander';
import { loadConfig, writeConfigEdit } from '../../config/index.js';
import { resolveRuntimePaths } from '../../platform/index.js';
import {
  BUILTIN_THEMES,
  exportThemeForTerminal,
  resolveTheme,
  validateThemeContrast,
  type ExportTerminalKind,
} from '../../ui/theme/index.js';

export function registerThemeCommands(program: Command, stdout: NodeJS.WritableStream): void {
  const thm = program.command('theme').description('Manage and export UI themes');

  thm
    .command('list')
    .description('List available themes')
    .action(() => {
      const { config } = loadConfig();
      for (const name of Object.keys(BUILTIN_THEMES)) {
        const mark = config.ui.theme === name ? '*' : ' ';
        stdout.write(`${mark} ${name}\n`);
      }
    });

  thm
    .command('set <name>')
    .description('Set active UI theme in user config')
    .action((name: string) => {
      const paths = resolveRuntimePaths();
      resolveTheme(name, {}, paths.themesDir);
      writeConfigEdit(paths.configFile, ['ui', 'theme'], name);
      stdout.write(`Theme set to "${name}" in ${paths.configFile}\n`);
    });

  thm
    .command('validate <name>')
    .description('Validate theme tokens and WCAG contrast ratios')
    .action((name: string) => {
      const paths = resolveRuntimePaths();
      const theme = resolveTheme(name, {}, paths.themesDir);
      const res = validateThemeContrast(theme);
      for (const c of res.checks) {
        const rStr = c.ratio !== null ? c.ratio.toFixed(2) : 'n/a';
        stdout.write(`${c.level.padEnd(4)} ${c.token.padEnd(18)} contrast=${rStr}\n`);
      }
      if (!res.ok) process.exitCode = 2;
    });

  thm
    .command('export')
    .description('Export active theme for a terminal emulator')
    .requiredOption(
      '--terminal <t>',
      'kitty|wezterm|alacritty|ghostty|iterm2|windows-terminal|vscode',
    )
    .action((opts: { terminal: ExportTerminalKind }) => {
      const paths = resolveRuntimePaths();
      const { config } = loadConfig();
      const theme = resolveTheme(config.ui.theme, config.ui.colorOverrides, paths.themesDir);
      const out = exportThemeForTerminal(opts.terminal, theme, config.ui.terminalProfile);
      stdout.write(`${out.content}\n# ${out.installHint}\n`);
    });
}
