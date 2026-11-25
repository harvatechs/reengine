/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'util-no-internal-deps',
      severity: 'error',
      from: { path: '^src/util/' },
      to: { path: '^src/', pathNot: '^src/util/' },
    },
    {
      name: 'platform-only-util',
      severity: 'error',
      from: { path: '^src/platform/' },
      to: { path: '^src/(?!platform/|util/)' },
    },
    {
      name: 'core-only-util',
      severity: 'error',
      from: { path: '^src/core/' },
      to: { path: '^src/(?!core/|util/)' },
    },
    {
      name: 'config-only-util-platform',
      severity: 'error',
      from: { path: '^src/config/' },
      to: { path: '^src/(?!config/|util/|platform/)' },
    },
    {
      name: 'providers-layer',
      severity: 'error',
      from: { path: '^src/providers/' },
      to: { path: '^src/(?!providers/|core/contracts\\.ts|util/|platform/)' },
    },
    {
      name: 'tools-layer',
      severity: 'error',
      from: { path: '^src/tools/' },
      to: { path: '^src/(?!tools/|core/contracts\\.ts|util/|platform/)' },
    },
    {
      name: 'mcp-layer',
      severity: 'error',
      from: { path: '^src/mcp/' },
      to: { path: '^src/(?!mcp/|core/contracts\\.ts|util/|platform/)' },
    },
    {
      name: 'engine-layer',
      severity: 'error',
      from: { path: '^src/engine/' },
      to: { path: '^src/(?!engine/|mcp/|core/contracts\\.ts|config/|util/|platform/)' },
    },
    {
      name: 'ui-no-internals',
      severity: 'error',
      from: { path: '^src/ui/' },
      to: { path: '^src/(providers|mcp|engine|tools|app|cli)/' },
    },
    {
      name: 'no-ink-outside-ui-cli',
      severity: 'error',
      from: { path: '^src/(?!ui/|cli/|app/)' },
      to: { path: 'node_modules/(ink|react)/' },
    },
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.json' },
  },
};
