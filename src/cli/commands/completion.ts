import type { Command } from 'commander';
import { ConfigError } from '../../util/index.js';

const SUBCOMMANDS = ['config', 'completion', 'version'];

function renderBashCompletion(): string {
  return `_reengine_completions() {
  local cur="\${COMP_WORDS[COMP_CWORD]}"
  if [[ \${COMP_CWORD} -eq 1 ]]; then
    COMPREPLY=( $(compgen -W "${SUBCOMMANDS.join(' ')}" -- "\${cur}") )
  fi
}
complete -F _reengine_completions reengine
complete -F _reengine_completions ree
`;
}

function renderZshCompletion(): string {
  return `#compdef reengine ree
_reengine() {
  local -a commands
  commands=(
    'config:Manage ReEngine configuration'
    'completion:Generate shell completion script'
    'version:Show version and runtime info'
  )
  _describe 'command' commands
}
compdef _reengine reengine ree
`;
}

function renderFishCompletion(): string {
  return (
    [
      ...SUBCOMMANDS.map((cmd) => `complete -c reengine -f -n '__fish_use_subcommand' -a '${cmd}'`),
      ...SUBCOMMANDS.map((cmd) => `complete -c ree -f -n '__fish_use_subcommand' -a '${cmd}'`),
    ].join('\n') + '\n'
  );
}

function renderPowerShellCompletion(): string {
  const list = SUBCOMMANDS.map((c) => `'${c}'`).join(', ');
  return `Register-ArgumentCompleter -Native -CommandName @('reengine', 'ree') -ScriptBlock {
  param($wordToComplete, $commandAst, $cursorPosition)
  @(${list}) | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {
    [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_)
  }
}
`;
}

export function registerCompletionCommand(program: Command, stdout: NodeJS.WritableStream): void {
  program
    .command('completion <shell>')
    .description('Generate shell completion script (bash, zsh, fish, powershell)')
    .action((shell: string) => {
      switch (shell.toLowerCase()) {
        case 'bash':
          stdout.write(renderBashCompletion());
          break;
        case 'zsh':
          stdout.write(renderZshCompletion());
          break;
        case 'fish':
          stdout.write(renderFishCompletion());
          break;
        case 'powershell':
        case 'pwsh':
          stdout.write(renderPowerShellCompletion());
          break;
        default:
          throw new ConfigError(
            'INVALID_SHELL',
            `Unsupported shell "${shell}". Expected: bash, zsh, fish, or powershell.`,
          );
      }
    });
}
