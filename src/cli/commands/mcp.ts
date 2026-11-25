import type { Command } from 'commander';
import {
  addMcpServerConfig,
  listConfiguredMcpServers,
  removeMcpServerConfig,
  runMcpDoctor,
  setMcpServerEnabled,
} from '../../app/engine-service.js';

export function registerMcpCommands(program: Command, stdout: NodeJS.WritableStream): void {
  const mcp = program.command('mcp').description('Manage external MCP servers');

  mcp
    .command('list')
    .description('List configured MCP servers')
    .action(() => {
      const servers = listConfiguredMcpServers();
      if (servers.length === 0) {
        stdout.write('No external MCP servers configured.\n');
        return;
      }
      for (const s of servers) {
        stdout.write(
          `${s.name.padEnd(16)} ${s.transport.padEnd(8)} enabled=${String(s.enabled)} trust=${s.trust} (${s.target})\n`,
        );
      }
    });

  mcp
    .command('add <name>')
    .description('Add an external MCP server')
    .option('--transport <t>', 'Transport (stdio|http|sse)', 'stdio')
    .option('--command <cmd>', 'Command for stdio transport')
    .option('--url <url>', 'URL for http/sse transport')
    .option('--scope <scope>', 'Config scope (user|project)', 'user')
    .action(
      (
        name: string,
        opts: { transport: string; command?: string; url?: string; scope?: string },
      ) => {
        const file = addMcpServerConfig(name, opts);
        stdout.write(`Added MCP server "${name}" to ${file}\n`);
      },
    );

  mcp
    .command('remove <name>')
    .description('Remove an external MCP server')
    .action((name: string) => {
      const file = removeMcpServerConfig(name);
      stdout.write(`Removed MCP server "${name}" from ${file}\n`);
    });

  mcp
    .command('enable <name>')
    .description('Enable an external MCP server')
    .action((name: string) => {
      const file = setMcpServerEnabled(name, true);
      stdout.write(`Enabled MCP server "${name}" in ${file}\n`);
    });

  mcp
    .command('disable <name>')
    .description('Disable an external MCP server')
    .action((name: string) => {
      const file = setMcpServerEnabled(name, false);
      stdout.write(`Disabled MCP server "${name}" in ${file}\n`);
    });

  mcp
    .command('doctor')
    .description('Probe all configured MCP servers')
    .action(async () => {
      const res = await runMcpDoctor();
      stdout.write(`${JSON.stringify(res, null, 2)}\n`);
    });
}
