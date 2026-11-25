import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/unit/**/*.test.ts', 'test/unit/**/*.test.tsx', 'test/integration/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'dist/', 'test/fixtures/', 'scripts/', 'bin/'],
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'default',
          include: [
            'test/unit/**/*.test.ts',
            'test/unit/**/*.test.tsx',
            'test/integration/**/*.test.ts',
          ],
        },
      },
      {
        extends: true,
        test: {
          name: 'e2e',
          include: ['test/e2e/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'rea-real',
          include: ['test/rea-real/**/*.test.ts'],
        },
      },
    ],
  },
});
