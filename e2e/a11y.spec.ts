import { test } from '@playwright/test';
import { expectNoSeriousViolations } from './support/axe';

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`${scheme} colour scheme`, () => {
    // Reduced motion makes entrance animations and counters land on their final state at
    // once, so axe measures real colours instead of a half-faded frame.
    test.use({ colorScheme: scheme, reducedMotion: 'reduce' });

    // Every page a signed-out visitor can open; the signed-in screens are checked in the journey.
    for (const path of [
      '/sign-in',
      '/evidence',
      '/shot',
      '/overlay',
      '/movement',
      '/movement/J03WMX',
      '/status',
      '/pro',
      '/pro/2058017',
    ]) {
      test(`${path} has no serious accessibility violations`, async ({ page }) => {
        await page.goto(path);
        await page.getByRole('heading', { level: 1 }).waitFor();
        await page.waitForLoadState('networkidle');
        await expectNoSeriousViolations(page, `${path} (${scheme})`);
      });
    }
  });
}
