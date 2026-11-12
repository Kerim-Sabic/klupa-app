import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

/**
 * Integration tests talk to the REAL Supabase project named in `.env.local`. They are kept out of
 * `npm test` (which only includes `src/**`) and skip themselves when no test account is set.
 */
export default defineConfig({
  test: {
    // Plain Node: nothing here renders, and the live feed needs Node's own WebSocket events.
    environment: 'node',
    env: loadEnv('integration', process.cwd(), ['VITE_', 'KLUPA_']),
    include: ['tests/integration/**/*.int.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    coverage: { enabled: false },
  },
});
