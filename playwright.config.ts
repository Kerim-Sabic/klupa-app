import { defineConfig, devices } from '@playwright/test';
import { loadEnv } from 'vite';
import { PREVIEW_ORIGIN, PREVIEW_PORT } from './e2e/support/env';

const isCI = process.env.CI !== undefined && process.env.CI !== '';

// Locally the values live in .env.local; in CI they arrive as process.env. The same two
// VITE_ values are needed by the preview build (read by Vite itself) and by the tests.
const fileEnv = loadEnv('e2e', process.cwd(), ['VITE_', 'KLUPA_']);
for (const [key, value] of Object.entries(fileEnv)) {
  process.env[key] ??= value;
}

// The tests start their own preview server on this machine and talk only to it. The port can
// be moved (KLUPA_E2E_PORT) so that two checkouts can run their tests side by side without
// one reading the other's build.

// The signed-in journey needs the throwaway test account. Without it the journey project does
// not exist, so nothing is quietly skipped; CI must have it, and says so if it does not.
const JOURNEY = 'journey.spec.ts';
const hasTestAccount = (process.env.KLUPA_IT_EMAIL ?? '') !== '';
if (isCI && !hasTestAccount) {
  throw new Error('KLUPA_IT_EMAIL is not set: CI must run the signed-in journey.');
}

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  // One worker: the signed-in journey shares a single test account.
  workers: 1,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL: PREVIEW_ORIGIN,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'phone', testIgnore: JOURNEY, use: { ...devices['Pixel 7'] } },
    {
      name: 'desktop',
      testIgnore: JOURNEY,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    ...(hasTestAccount
      ? [{ name: 'journey', testMatch: JOURNEY, use: { ...devices['Pixel 7'] } }]
      : []),
  ],
  webServer: {
    command: `npm run build && npm run preview -- --port ${String(PREVIEW_PORT)} --strictPort`,
    url: PREVIEW_ORIGIN,
    reuseExistingServer: !isCI,
    timeout: 180_000,
  },
});
