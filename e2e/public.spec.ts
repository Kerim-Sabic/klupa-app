import { expect, test, type Page } from '@playwright/test';
import momentumScale from '../research/out/momentum_scale.json' with { type: 'json' };
import { PREVIEW_ORIGIN as ORIGIN } from './support/env';
import { watchPage } from './support/watch';

/** English formatting exactly as the page writes it: grouped counts, one-decimal percents. */
const count = (value: number): string => new Intl.NumberFormat('en-US').format(value);
const percent = (share: number): string => `${(share * 100).toFixed(1)}%`;

const { total } = momentumScale;

async function openEnglish(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
}

test.describe('sign-in', () => {
  test('an invalid email shows the inline error and sends nothing', async ({ page }) => {
    const sent: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/auth/v1/')) sent.push(request.url());
    });
    await openEnglish(page, '/sign-in');
    await page.getByLabel('Email').fill('not-an-email');
    await page.getByRole('button', { name: 'Email me a code' }).click();
    await expect(page.getByText('Enter a valid email address.')).toBeVisible();
    await expect(page.getByLabel('Email')).toHaveAttribute('aria-invalid', 'true');
    expect(sent).toEqual([]);
  });

  test('the language switch changes the page to Bosnian and survives a reload', async ({
    page,
  }) => {
    await openEnglish(page, '/sign-in');
    await page.getByRole('button', { name: 'Bosanski' }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'bs');
    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).not.toHaveText('Sign in to Klupa');
    const bosnianHeading = await heading.textContent();
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'bs');
    await expect(heading).toHaveText(bosnianHeading ?? '');
    await expect(page.getByRole('button', { name: 'Bosanski' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('the link to the evidence page works', async ({ page }) => {
    await openEnglish(page, '/sign-in');
    await page.getByRole('link', { name: 'See the research behind it' }).click();
    await expect(page).toHaveURL(/\/evidence$/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Who is on top, and can you trust it?' }),
    ).toBeVisible();
  });
});

test.describe('evidence page', () => {
  test('the three headline numbers equal the research result file', async ({ page }) => {
    await openEnglish(page, '/evidence');
    const card = (label: string) => page.getByRole('listitem').filter({ hasText: label }).first();

    await expect(card('Matches analysed')).toContainText(count(total.matches));
    await expect(card('3- and 10-minute windows point at opposite teams')).toContainText(
      percent(total.opposite / total.bothNonZero),
    );
    await expect(card('Agreed by every window and safe from one chance')).toContainText(
      percent(total.robust / total.gridPoints),
    );
  });

  test('the keyboard moves the reading panel and the window switch works', async ({ page }) => {
    await openEnglish(page, '/evidence');
    const slider = page.getByRole('slider', { name: 'Moment in the half' });
    const reading = page.getByRole('heading', { level: 3, name: /^At \d/ });
    await slider.scrollIntoViewIfNeeded();
    await slider.focus();
    const before = await reading.textContent();
    await slider.press('End');
    await expect(reading).not.toHaveText(before ?? '');
    const atEnd = await reading.textContent();
    await slider.press('Home');
    await expect(reading).not.toHaveText(atEnd ?? '');

    const chart = (minutes: number) =>
      page.getByRole('img', { name: new RegExp(`over the last ${String(minutes)} minutes`) });
    await expect(chart(5)).toBeVisible();
    await page.getByRole('radio', { name: '10 min' }).click();
    await expect(chart(10)).toBeVisible();
    await page.getByRole('radio', { name: '3 min' }).click();
    await expect(chart(3)).toBeVisible();
  });

  test('the research charts have text alternatives', async ({ page }) => {
    await openEnglish(page, '/evidence');
    for (const chart of [/^Reliability chart/, /^Horizontal bar chart/]) {
      await expect(page.getByRole('img', { name: chart })).toBeVisible();
      // The same words head a table that lists every value for screen-reader users.
      await expect(page.getByRole('table', { name: chart })).toBeAttached();
    }
  });
});

test.describe('page titles', () => {
  /** What the tab should say for the page on screen: its heading, then the app's name. */
  async function titleOfThisPage(page: Page): Promise<string> {
    const heading = (await page.getByRole('heading', { level: 1 }).textContent()) ?? '';
    const words = heading.replace(/\s+/g, ' ').trim();
    return words === '' || words === 'Klupa' ? 'Klupa' : `${words} · Klupa`;
  }

  test('a page is titled from its own heading, on arrival and after moving on', async ({
    page,
  }) => {
    // A page whose code is downloaded on first use.
    await openEnglish(page, '/evidence');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page).not.toHaveTitle('Klupa');
    await expect(page).toHaveTitle(await titleOfThisPage(page));

    await openEnglish(page, '/no/such/place');
    await expect(page).toHaveTitle('Page not found · Klupa');

    // A move inside the app, with no page load: the title follows the new heading.
    await page.getByRole('link', { name: 'Back to home' }).click();
    await expect(page).not.toHaveURL(/\/no\/such\/place$/);
    await expect(page).not.toHaveTitle('Page not found · Klupa');
    await expect(async () => {
      expect(await page.title()).toBe(await titleOfThisPage(page));
    }).toPass();
  });
});

test.describe('routing', () => {
  test('an unknown address shows the not-found page', async ({ page }) => {
    await openEnglish(page, '/no/such/place');
    await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Back to home' })).toBeVisible();
  });

  test('a deep link redirects a signed-out visitor to sign-in', async ({ page }) => {
    await openEnglish(page, '/matches');
    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'The match, read honestly.' }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Sign in to Klupa' })).toBeVisible();
  });
});

test.describe('every public page', () => {
  for (const path of [
    '/sign-in',
    '/evidence',
    '/no/such/place',
    '/matches',
    '/pro',
    '/pro/2058017',
  ]) {
    test(`${path} is clean at phone width`, async ({ page }) => {
      const watch = watchPage(page, ORIGIN);
      await page.setViewportSize({ width: 360, height: 740 });
      await openEnglish(page, path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await page.waitForLoadState('networkidle');
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, 'horizontal overflow in px').toBeLessThanOrEqual(0);
      expect(watch.problems).toEqual([]);
    });
  }
});
