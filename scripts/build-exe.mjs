import { execFileSync, execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { build } from 'esbuild';

const root = process.cwd();
const outDir = path.join(root, 'dist-exe');
fs.mkdirSync(outDir, { recursive: true });

const bundlePath = path.join(outDir, 'reengine.cjs');
const seaConfigPath = path.join(outDir, 'sea-config.json');
const blobPath = path.join(outDir, 'sea-prep.blob');
const exePath = path.join(outDir, process.platform === 'win32' ? 'reengine.exe' : 'reengine');

const seaCompatPlugin = {
  name: 'sea-compat',
  setup(b) {
    b.onResolve({ filter: /^yoga-wasm-web(\/auto)?$/ }, () => ({
      path: path.join(root, 'node_modules/yoga-wasm-web/dist/asm.js'),
    }));
    b.onResolve({ filter: /^jsonc-parser$/ }, () => ({
      path: path.join(root, 'node_modules/jsonc-parser/lib/esm/main.js'),
    }));
    b.onLoad({ filter: /ink[\\/]build[\\/]reconciler\.js$/ }, (args) => {
      const src = fs.readFileSync(args.path, 'utf-8');
      return {
        contents: src.replace(/await import\(['"]\.\/devtools\.js['"]\);?/g, 'void 0;'),
        loader: 'js',
      };
    });
  },
};

await build({
  entryPoints: [path.join(root, 'src/cli/main.ts')],
  outfile: bundlePath,
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  minify: false,
  define: {
    'import.meta.url': 'undefined',
  },
  plugins: [seaCompatPlugin],
  external: ['@napi-rs/keyring', 'react-devtools-core'],
});

const promptDir = path.join(root, 'src/core/prompt');
const assets = {
  'config.v1.schema.json': 'schemas/config.v1.schema.json',
};
for (const file of fs.readdirSync(promptDir)) {
  if (file.endsWith('.md')) {
    assets[`prompt/${file}`] = `src/core/prompt/${file}`;
  }
}

fs.writeFileSync(
  seaConfigPath,
  JSON.stringify(
    {
      main: bundlePath,
      output: blobPath,
      disableExperimentalSEAWarning: true,
      useCodeCache: false,
      assets,
    },
    null,
    2,
  ),
  'utf-8',
);

execFileSync(process.execPath, ['--experimental-sea-config', seaConfigPath], { stdio: 'inherit' });
fs.copyFileSync(process.execPath, exePath);

const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
execSync(
  `${npxCmd} --yes postject "${exePath}" NODE_SEA_BLOB "${blobPath}" --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2`,
  { stdio: 'inherit' },
);

const userBin = path.join(os.homedir(), '.reengine', 'bin');
fs.mkdirSync(userBin, { recursive: true });
const installedExe = path.join(userBin, path.basename(exePath));
const aliasExe = path.join(userBin, process.platform === 'win32' ? 'ree.exe' : 'ree');
fs.copyFileSync(exePath, installedExe);
fs.copyFileSync(exePath, aliasExe);

process.stdout.write(
  `Built single executable: ${exePath}\nInstalled to PATH dir: ${installedExe}\n`,
);
