import tseslint from 'typescript-eslint';

const noUiLiteralsPlugin = {
  rules: {
    'no-ui-literals': {
      meta: {
        type: 'problem',
        docs: { description: 'Disallow hard-coded hex colors outside src/ui/theme/' },
        schema: [],
      },
      create(context) {
        const filename = context.filename.replace(/\\/g, '/');
        if (!filename.includes('/src/ui/') || filename.includes('/src/ui/theme/')) {
          return {};
        }
        const hexRegex = /^#[0-9a-fA-F]{3,8}$/;
        return {
          Literal(node) {
            if (typeof node.value === 'string' && hexRegex.test(node.value)) {
              context.report({
                node,
                message:
                  'Hard-coded hex color "{{val}}" is forbidden outside src/ui/theme/ (R-060).',
                data: { val: node.value },
              });
            }
          },
        };
      },
    },
  },
};

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'dist-exe/**',
      'node_modules/**',
      'coverage/**',
      'test/fixtures/**',
      'schemas/**',
      'scripts/**',
      'bin/**',
      'eslint.config.mjs',
      '.dependency-cruiser.cjs',
      'tsup.config.ts',
      'vitest.config.ts',
    ],
  },
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      reengine: noUiLiteralsPlugin,
    },
    rules: {
      'no-console': 'error',
      'no-warning-comments': ['error', { terms: ['todo', 'fixme', 'xxx'], location: 'anywhere' }],
      'max-lines': ['error', { max: 400, skipBlankLines: false, skipComments: false }],
      complexity: ['error', 15],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      'reengine/no-ui-literals': 'error',
    },
  },
  {
    files: ['test/**/*.ts', 'test/**/*.tsx'],
    rules: {
      'max-lines': 'off',
      'no-console': 'off',
    },
  },
);
