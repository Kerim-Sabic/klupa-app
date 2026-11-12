import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'];

/**
 * Fails on any serious or critical violation and names each rule and target, so a failure
 * reads as a to-do list. Rules are never switched off wholesale; add a single-rule
 * exclusion here, with the reason, only for a proven false positive.
 */
export async function expectNoSeriousViolations(page: Page, where: string): Promise<void> {
  // Entrance animations fade text in; axe must not measure colours mid-fade. Motion sets an
  // inline opacity on some elements and runs Web Animations on others, so wait for both.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const fading = [...document.querySelectorAll<HTMLElement>('[style*="opacity"]')].some(
          (element) => Number(getComputedStyle(element).opacity) !== 1,
        );
        const running = document
          .getAnimations()
          .some(
            (animation) =>
              animation.playState === 'running' &&
              animation.effect?.getComputedTiming().iterations !== Infinity,
          );
        return !fading && !running;
      }),
    )
    .toBe(true);
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const serious = results.violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical',
  );
  const report = serious.map(
    (violation) =>
      `${violation.id} (${violation.impact ?? '?'}): ${violation.nodes
        .map((node) => `${node.target.join(' ')} [${node.any[0]?.message ?? ''}]`)
        .join(' | ')}`,
  );
  expect(report, `axe violations on ${where}`).toEqual([]);
}
