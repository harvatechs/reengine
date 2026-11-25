import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'test/unit/**/*.test.ts',
      'test/unit/**/*.test.tsx',
      'test/integration/**/*.test.ts',
      'test/security/**/*.test.ts',
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'dist/', 'test/fixtures/', 'scripts/', 'bin/'],
    },
  },
});
