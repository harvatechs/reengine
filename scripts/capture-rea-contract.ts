import { createRequire } from 'node:module';
import * as fs from 'node:fs';
import * as path from 'node:path';

const require = createRequire(import.meta.url);

function resolveSdkModule(subpath: string): string {
  const localPath = path.resolve(process.cwd(), 'node_modules/@modelcontextprotocol/sdk', subpath);
  if (fs.existsSync(localPath)) return localPath;
  const pkgEntry = require.resolve('@modelcontextprotocol/sdk/package.json');
  const resolvedPath = path.resolve(path.dirname(pkgEntry), subpath);
  if (fs.existsSync(resolvedPath)) return resolvedPath;
  throw new Error(`Could not resolve @modelcontextprotocol/sdk/${subpath}`);
}

function resolveReaEntry(): { entry: string; version: string } {
  const localPkgPath = path.resolve(process.cwd(), 'node_modules/rea-agents/package.json');
  const pkgPath = fs.existsSync(localPkgPath)
    ? localPkgPath
    : require.resolve('rea-agents/package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as {
    version: string;
    bin?: Record<string, string>;
  };
  const binRel = pkg.bin?.rea ?? pkg.bin?.['rea-agents'] ?? 'scripts/rea.mjs';
  return {
    entry: path.resolve(path.dirname(pkgPath), binRel),
    version: pkg.version,
  };
}

function normalizeFixture(data: unknown, rootDir: string): unknown {
  const raw = JSON.stringify(data, null, 2);
  const escapedRoot = rootDir.replace(/\\/g, '\\\\');
  const posixRoot = rootDir.replace(/\\/g, '/');
  return JSON.parse(
    raw
      .replaceAll(escapedRoot, '<WORKSPACE>')
      .replaceAll(posixRoot, '<WORKSPACE>')
      .replace(/C:\\\\Users\\\\[^"\\\\]+/g, 'C:\\\\Users\\\\<USER>')
      .replace(/\/Users\/[^"/]+/g, '/Users/<USER>')
      .replace(/\/home\/[^"/]+/g, '/home/<USER>'),
  );
}

async function main(): Promise<void> {
  const { Client } = (await import(
    `file://${resolveSdkModule('dist/esm/client/index.js').replace(/\\/g, '/')}`
  )) as {
    Client: new (
      info: { name: string; version: string },
      opts: { capabilities: Record<string, unknown> },
    ) => {
      connect(transport: unknown): Promise<void>;
      getServerCapabilities(): unknown;
      getServerVersion(): unknown;
      listTools(params?: { cursor?: string }): Promise<{ tools: unknown[]; nextCursor?: string }>;
      listPrompts(): Promise<{ prompts: unknown[] }>;
      listResources(): Promise<{ resources: unknown[] }>;
      callTool(params: { name: string; arguments: Record<string, unknown> }): Promise<unknown>;
      close(): Promise<void>;
    };
  };

  const { StdioClientTransport } = (await import(
    `file://${resolveSdkModule('dist/esm/client/stdio.js').replace(/\\/g, '/')}`
  )) as {
    StdioClientTransport: new (opts: {
      command: string;
      args: string[];
      stderr?: 'pipe' | 'inherit';
    }) => unknown;
  };

  const { entry, version } = resolveReaEntry();
  const outDir = path.resolve(process.cwd(), `test/fixtures/rea/${version}/mcp`);
  fs.mkdirSync(outDir, { recursive: true });

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [entry, '--mcp'],
    stderr: 'pipe',
  });

  const client = new Client(
    { name: 'reengine-contract-capture', version: '1.0.0' },
    { capabilities: {} },
  );

  await client.connect(transport);

  const serverInfo = {
    version: client.getServerVersion(),
    capabilities: client.getServerCapabilities(),
  };

  const allTools: unknown[] = [];
  let cursor: string | undefined;
  do {
    const res = await client.listTools(cursor ? { cursor } : undefined);
    allTools.push(...res.tools);
    cursor = res.nextCursor;
  } while (cursor);

  let prompts: unknown[] = [];
  try {
    const pRes = await client.listPrompts();
    prompts = pRes.prompts;
  } catch (err) {
    prompts = [{ error: err instanceof Error ? err.message : String(err) }];
  }

  let resources: unknown[] = [];
  try {
    const rRes = await client.listResources();
    resources = rRes.resources;
  } catch (err) {
    resources = [{ error: err instanceof Error ? err.message : String(err) }];
  }

  const jsFixturePath = path.resolve(process.cwd(), 'test/fixtures/js-app');
  const successCall = await client.callTool({
    name: 'analyze_javascript_application',
    arguments: { input_path: jsFixturePath },
  });

  let errorCall: unknown;
  try {
    errorCall = await client.callTool({
      name: 'analyze_javascript_application',
      arguments: { input_path: path.resolve(process.cwd(), 'test/fixtures/does-not-exist-999') },
    });
  } catch (err) {
    errorCall = { thrown: err instanceof Error ? err.message : String(err) };
  }

  await client.close();

  fs.writeFileSync(
    path.join(outDir, 'initialize.json'),
    `${JSON.stringify(serverInfo, null, 2)}\n`,
  );
  fs.writeFileSync(path.join(outDir, 'tools.json'), `${JSON.stringify(allTools, null, 2)}\n`);
  fs.writeFileSync(path.join(outDir, 'prompts.json'), `${JSON.stringify(prompts, null, 2)}\n`);
  fs.writeFileSync(path.join(outDir, 'resources.json'), `${JSON.stringify(resources, null, 2)}\n`);
  fs.writeFileSync(
    path.join(outDir, 'call-js-success.json'),
    `${JSON.stringify(normalizeFixture(successCall, process.cwd()), null, 2)}\n`,
  );
  fs.writeFileSync(
    path.join(outDir, 'call-js-error.json'),
    `${JSON.stringify(normalizeFixture(errorCall, process.cwd()), null, 2)}\n`,
  );

  process.stdout.write(
    `Captured REA ${version} MCP contract: ${allTools.length} tools, ${prompts.length} prompts\n`,
  );
}

main().catch((err) => {
  process.stderr.write(
    `Contract capture failed: ${err instanceof Error ? err.stack : String(err)}\n`,
  );
  process.exit(1);
});
