import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

/**
 * Emits /healthz.json with the commit that was built, so the post-deploy smoke
 * test can prove the live origin serves the revision that passed CI.
 */
function healthFile(): Plugin {
  return {
    name: 'klupa-health-file',
    apply: 'build',
    generateBundle() {
      const commit = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? 'local';
      this.emitFile({
        type: 'asset',
        fileName: 'healthz.json',
        source: `${JSON.stringify({ status: 'ok', commit })}
`,
      });
    },
  };
}

/** The commit being built, so an error report can name the release it came from. */
const release = (process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? 'local').slice(
  0,
  12,
);

export default defineConfig({
  plugins: [react(), tailwindcss(), healthFile()],
  define: { 'import.meta.env.VITE_RELEASE': JSON.stringify(release) },
  build: {
    // No source maps are published: the bundle is all a browser needs.
    sourcemap: false,
    target: 'es2022',
    rolldownOptions: {
      output: {
        // Libraries change far less often than app code: keep them in their own cacheable files.
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules\/(react|react-dom|scheduler)\// },
            { name: 'supabase', test: /node_modules\/@supabase\// },
            {
              name: 'motion',
              test: /node_modules\/(motion|motion-dom|motion-utils|framer-motion)\//,
            },
            {
              name: 'app-libs',
              test: /node_modules\/(react-router|i18next|react-i18next|@tanstack)\//,
            },
          ],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    // Unit tests never talk to a real project; these satisfy start-up validation only.
    env: {
      VITE_SUPABASE_URL: 'https://unit-tests.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_unit_tests_only_000000',
    },
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/test/**',
        'src/main.tsx',
        'src/vite-env.d.ts',
        'src/lib/database/**',
        // Thin data access with no logic: exercised by the database isolation test, not unit tests.
        'src/features/**/api.ts',
        'src/lib/data.ts',
      ],
      reporter: ['text-summary', 'lcov', 'json-summary'],
      thresholds: {
        lines: 90,
        functions: 90,
        statements: 90,
        branches: 85,
      },
    },
  },
});
