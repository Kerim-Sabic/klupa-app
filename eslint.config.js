import js from '@eslint/js';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // src/lib/database is generated from the live schema; it is checked by tsc, not by lint.
  {
    ignores: [
      'dist',
      'coverage',
      'node_modules',
      'eslint.config.js',
      'src/lib/database',
      'research',
      // k6 scripts run in the k6 runtime, not in Node or the browser.
      'scripts/load',
      // The MediaPipe runtime is vendored byte for byte; a test pins its checksum.
      'public/vision',
      'playwright-report',
      'test-results',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks, 'jsx-a11y': jsxA11y },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,
      // The engine is the product's source of truth: keep every file readable in one sitting.
      'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
      'no-console': 'error',
      // Dropping keys with a rest pattern is clearer than deleting them afterwards.
      '@typescript-eslint/no-unused-vars': ['error', { ignoreRestSiblings: true }],
    },
  },
  // The service worker is a plain script served as-is from public/, outside the TypeScript
  // program, so it is linted without type information and with the worker's globals.
  // Build-time Node scripts outside the TypeScript program: linted without type information.
  {
    files: ['scripts/db-types.mjs', 'scripts/bundle-size.mjs'],
    rules: tseslint.configs.disableTypeChecked.rules,
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: { projectService: false, program: null },
    },
  },
  {
    files: ['public/sw.js'],
    rules: tseslint.configs.disableTypeChecked.rules,
    languageOptions: {
      globals: { ...globals.serviceworker },
      parserOptions: { projectService: false, program: null },
    },
  },
);
