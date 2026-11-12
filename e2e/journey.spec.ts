import { devices, expect, test, type BrowserContext, type Page } from '@playwright/test';
import {
  deleteAllClubs,
  injectSessionScript,
  sessionStorageKey,
  signInTestAccount,
  type TestAccount,
} from './support/account';
import {
  CLUB_NAME,
  OPPONENT,
  SQUAD,
  TEAM_NAME,
  addPlayer,
  checkScreen,
  goTo,
  recordShot,
} from './support/coach';
import { PREVIEW_ORIGIN, requiredEnv } from './support/env';
import { watchPage, type PageWatch } from './support/watch';

const BASE_URL = PREVIEW_ORIGIN;
// The session page is titled with its focus, which the planner chose; anything but the planner's own title.
const SESSION_HEADING = /^(?!Plan a session$).+/;

// Runs as its own Playwright project (see playwright.config.ts): once, on a phone, and only
// where the throwaway test account is configured. CI refuses to start without it.
test.describe.serial('the coach loop, from first sign-in to deleting the club', () => {
  // Undefined until beforeAll got that far, so afterAll can clean up from any point of failure.
  let account: TestAccount | undefined;
  let context: BrowserContext | undefined;
  let page: Page;
  let watch: PageWatch;

  test.beforeAll(async ({ browser }) => {
    // The journey shares one browser context so the match clock, the outbox and the
    // session survive from step to step like they do on a coach's phone.
    const signedIn = await signInTestAccount();
    account = signedIn;
    await deleteAllClubs(signedIn);
    const fresh = await browser.newContext({ ...devices['Pixel 7'], baseURL: BASE_URL });
    context = fresh;
    await fresh.addInitScript(
      injectSessionScript(sessionStorageKey(requiredEnv('VITE_SUPABASE_URL')), signedIn.session),
    );
    page = await fresh.newPage();
    watch = watchPage(page, BASE_URL);
  });

  test.afterAll(async () => {
    // Best effort: a failed run must not leave clubs behind (the account allows only five).
    await context?.close();
    if (account === undefined) return;
    await deleteAllClubs(account).catch(() => 0);
    // Local scope: a global sign-out would also end other sessions of the shared account.
    await account.client.auth.signOut({ scope: 'local' });
  });

  test('sets up a club and a team', async () => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/welcome$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Set up your club' })).toBeVisible();
    await checkScreen(page, 'welcome', 'Set up your club');
    await page.getByLabel('Club name').fill(CLUB_NAME);
    await page.getByLabel('Team name').fill(TEAM_NAME);
    await page.getByRole('button', { name: 'Create club' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
    await expect(page.getByRole('main').getByText(`${TEAM_NAME} · ${CLUB_NAME}`)).toBeVisible();
    await checkScreen(page, 'home', 'Today');
  });

  test('adds four players to the squad', async () => {
    await goTo(page, 'Club');
    await checkScreen(page, 'club', 'Club');
    await page.getByRole('link', { name: /^Squad/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Squad' })).toBeVisible();
    await expect(page.getByText('No players yet')).toBeVisible();
    for (const player of SQUAD) await addPlayer(page, player);
    const table = page.getByRole('table', { name: `Squad of ${TEAM_NAME}` });
    await expect(table.getByRole('row')).toHaveCount(SQUAD.length + 1);
    await expect(table.getByRole('row', { name: /Hare/ })).toContainText('Granted');
    await checkScreen(page, 'squad', 'Squad');
  });

  test('creates a match and starts it', async () => {
    await goTo(page, 'Matches');
    await expect(page.getByText('No matches yet')).toBeVisible();
    await checkScreen(page, 'matches (empty)', 'Matches');
    await page.getByRole('button', { name: 'New match' }).first().click();
    const sheet = page.getByRole('dialog', { name: 'New match' });
    await sheet.getByLabel('Opponent').fill(OPPONENT);
    await sheet.getByRole('button', { name: 'Create match' }).click();
    await expect(page).toHaveURL(/\/matches\/[0-9a-f-]+\/live$/);
    await expect(page.getByRole('heading', { level: 1, name: `vs ${OPPONENT}` })).toBeVisible();
    await expect(page.getByText('Start the match to record events.')).toBeVisible();
    await page.getByRole('button', { name: 'Start match' }).click();
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  });

  test('puts three players on the pitch', async () => {
    await page.getByRole('button', { name: 'Lineup' }).click();
    const sheet = page.getByRole('dialog', { name: 'Who is on the pitch' });
    for (const { label, shirt } of SQUAD.slice(0, 3)) {
      const toggle = sheet.getByRole('switch', { name: `${label}, number ${shirt}` });
      await toggle.click();
      await expect(toggle).toBeChecked();
    }
    await expect(sheet.getByText('On the pitch: 3')).toBeVisible();
    await expect(sheet.getByText('Not played yet')).toBeVisible();
    await checkScreen(page, 'lineup sheet', `vs ${OPPONENT}`);
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
  });

  test('records a shot, a goal, a corner and a lost ball, then undoes the last', async () => {
    await recordShot(page, 'Shot on target');
    await expect(page.getByText(/^Chance quality \d/).first()).toBeVisible();
    await recordShot(page, 'Goal');
    await page.getByRole('button', { name: 'Corner', exact: true }).click();
    await page.getByRole('button', { name: 'Lost the ball in own half', exact: true }).click();

    const pinned = page.getByRole('button', { name: 'Undo the last event' });
    await expect(pinned.locator('xpath=..')).toContainText('Lost the ball in own half');
    await pinned.click();
    await expect(pinned.locator('xpath=..')).toContainText('Corner');
    await expect(
      page.getByText('Lost the ball in own half', { exact: false }).first(),
    ).toBeVisible();
    await expect(page.getByText('All saved')).toBeVisible();
    await checkScreen(page, 'tagger', `vs ${OPPONENT}`);
  });

  test('ends the period and finishes the match', async () => {
    await page.getByRole('button', { name: 'End period' }).click();
    await expect(page.getByRole('button', { name: 'Start period 2' })).toBeVisible();
    await page.getByRole('button', { name: 'Finish match' }).click();
    const sheet = page.getByRole('dialog', { name: 'Finish the match?' });
    await sheet.getByRole('button', { name: 'Finish match' }).click();
    await expect(page).toHaveURL(/\/matches\/[0-9a-f-]+$/);
    await expect(
      page.getByRole('heading', { level: 1, name: `Against ${OPPONENT}` }),
    ).toBeVisible();
  });

  test('reads the match review', async () => {
    await expect(page.getByText(`Score: ${TEAM_NAME} 1, ${OPPONENT} 0`)).toBeAttached();
    await expect(page.getByRole('img', { name: /^Chance balance over the last/ })).toBeVisible();
    await expect(page.getByRole('heading', { level: 3, name: /^At \d/ })).toBeVisible();
    const map = page.getByRole('img', { name: /^Shot map of the attacking half/ });
    await expect(map).toBeVisible();
    await expect(map).toHaveAccessibleName(new RegExp(`Shots by ${TEAM_NAME}: 2,`));
    await expect(page.getByText('Shots 2 · goals 1')).toBeVisible();
    await checkScreen(page, 'match review', `Against ${OPPONENT}`);
  });

  test('plans a training session from the match', async () => {
    await page.getByRole('link', { name: 'Plan training from this match' }).click();
    await expect(page.getByText(`Planned from your match against ${OPPONENT}.`)).toBeVisible();
    await page.getByRole('button', { name: 'More players expected' }).click();
    await page.getByRole('radio', { name: '75 min' }).click();
    await expect(page.getByText(/^75 minutes · about/)).toBeVisible();
    await checkScreen(page, 'planner', 'Plan a session');
    await page.getByRole('button', { name: 'Save session' }).click();
    await expect(page.getByText('Session saved.')).toBeVisible();
    await expect(page).toHaveURL(/\/training\/[0-9a-f-]+$/);
  });

  test('marks attendance, effort and attempts on the session page', async () => {
    const fox = page.getByRole('radiogroup', { name: 'Fox' });
    await fox.getByRole('radio', { name: 'Present' }).click();
    await expect(fox.getByRole('radio', { name: 'Present' })).toBeChecked();
    await page.getByRole('button', { name: 'Five minutes less for Fox' }).click();
    await page.getByRole('button', { name: 'Effort 7 for Fox' }).click();
    await expect(page.getByRole('button', { name: 'Effort 7 for Fox' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    for (let attempt = 0; attempt < 3; attempt++) {
      await page.getByRole('button', { name: 'Add an attempt for Fox' }).click();
    }
    for (let success = 0; success < 2; success++) {
      await page.getByRole('button', { name: 'Add a success for Fox' }).click();
    }
    await page.getByRole('button', { name: 'Remove a success for Fox' }).click();
    await expect(page.getByRole('button', { name: 'Remove an attempt for Fox' })).toBeEnabled();
    await checkScreen(page, 'session', SESSION_HEADING);
    await page.getByRole('button', { name: 'Mark completed' }).click();
    await expect(page.getByText('Session marked as completed.')).toBeVisible();
    // Every tap saves on its own; let the last writes land before the next screen reads them.
    await page.waitForLoadState('networkidle');
  });

  test('shows fairness: the ledger, the second look, load and pitch use', async () => {
    await goTo(page, 'Fairness');
    const ledger = page.getByRole('table', {
      name: 'Match minutes, training minutes and what was observed, for each player',
    });
    await expect(ledger.getByRole('row')).toHaveCount(SQUAD.length + 1);
    for (const { label } of SQUAD) await expect(ledger).toContainText(label);
    const secondLook = page.getByRole('region', { name: 'Second look' });
    await expect(secondLook.getByRole('listitem').first()).toBeVisible();
    expect(await secondLook.getByRole('listitem').count()).toBeGreaterThan(0);
    await checkScreen(page, 'fairness', 'Fairness');

    for (const view of ['Training load', 'Pitch use']) {
      await page.getByRole('radio', { name: view }).click();
      await expect(page.getByRole('radio', { name: view })).toBeChecked();
      await expect(page.getByText('Could not load this view')).toHaveCount(0);
      await expect(page.getByRole('alert')).toHaveCount(0);
      await checkScreen(page, view, 'Fairness');
    }
  });

  test('opens the training list, the club settings and the activity log', async () => {
    await page.goto('/training');
    await checkScreen(page, 'training', 'Training');
    // The session planned earlier is listed, next to the link that plans a new one.
    await expect(
      page.getByRole('main').locator('a[href^="/training/"]:not([href^="/training/new"])').first(),
    ).toBeVisible();

    await page.goto('/club/settings');
    await checkScreen(page, 'settings', 'Club settings');
    await expect(page.getByLabel('Club name')).toHaveValue(CLUB_NAME);

    await page.goto('/club/activity');
    await checkScreen(page, 'activity', 'Activity log');
    // The log names the records that changed, never their values.
    await expect(page.getByRole('main')).not.toContainText(SQUAD[0]?.label ?? 'no player');
  });

  test('deletes the club from privacy and data and returns to the welcome page', async () => {
    await goTo(page, 'Club');
    await page.getByRole('link', { name: /^Privacy and data/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Privacy and data' })).toBeVisible();
    await checkScreen(page, 'privacy', 'Privacy and data');
    await page.getByRole('button', { name: 'Delete this club' }).click();
    const sheet = page.getByRole('dialog', { name: `Delete ${CLUB_NAME}?` });
    await sheet.getByLabel('Type the club name to confirm').fill(CLUB_NAME);
    await sheet.getByRole('button', { name: 'Delete club permanently' }).click();
    await expect(page).toHaveURL(/\/welcome$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Set up your club' })).toBeVisible();
  });

  test('the whole journey raised no console errors or failed requests', () => {
    expect(watch.problems).toEqual([]);
  });
});
