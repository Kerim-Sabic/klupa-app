import { expect, type Page } from '@playwright/test';
import { expectNoSeriousViolations } from './axe';

export interface Player {
  readonly label: string;
  readonly shirt: string;
  readonly quarter: string;
}

/** Invented nicknames only: the product refuses real names and so do its tests. */
export const SQUAD: readonly Player[] = [
  { label: 'Fox', shirt: '4', quarter: 'Q1 (Jan–Mar)' },
  { label: 'Owl', shirt: '7', quarter: 'Q2 (Apr–Jun)' },
  { label: 'Hare', shirt: '9', quarter: 'Q3 (Jul–Sep)' },
  { label: 'Lynx', shirt: '11', quarter: 'Q4 (Oct–Dec)' },
];

export const CLUB_NAME = 'Klupa E2E Club';
export const TEAM_NAME = 'E2E Under-13s';
export const OPPONENT = 'E2E Rovers';

/** One tap on the bottom tab bar (or the side rail on a wide screen). */
export async function goTo(page: Page, destination: string): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: destination, exact: true })
    .click();
}

/** Axe on the screen the coach is looking at, once its content has arrived. */
export async function checkScreen(
  page: Page,
  where: string,
  heading: string | RegExp,
): Promise<void> {
  // Name the heading: right after a tap the previous screen's h1 is still on the page.
  await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
  await page.waitForLoadState('networkidle');
  await expectNoSeriousViolations(page, where);
}

export async function addPlayer(page: Page, player: Player): Promise<void> {
  await page.getByRole('button', { name: 'Add a player' }).first().click();
  const sheet = page.getByRole('dialog', { name: 'Add a player' });
  await sheet.getByLabel('Label').fill(player.label);
  await sheet.getByLabel('Shirt number').fill(player.shirt);
  await sheet.getByLabel('Guardian consent').selectOption({ label: 'Granted' });
  await sheet.getByLabel('Birth quarter (optional)').selectOption({ label: player.quarter });
  await sheet.getByRole('button', { name: 'Add player' }).click();
  await expect(page.getByText(`Player added: ${player.label}.`)).toBeVisible();
  await expect(sheet).toBeHidden();
}

/**
 * Tap an event button. A shot asks where it was taken from: tap the pitch inside the box
 * and save, and the sheet must show a chance-quality value for that spot.
 */
export async function recordShot(page: Page, kind: string): Promise<void> {
  await page.getByRole('button', { name: kind, exact: true }).click();
  const sheet = page.getByRole('dialog', { name: new RegExp(`^${kind}: where was it taken`) });
  await sheet.getByRole('button', { name: /^Attacking half with the goal at the top/ }).click({
    position: { x: 150, y: 120 },
  });
  await expect(sheet.getByText(/^Chance quality \d/)).toBeVisible();
  await sheet.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(sheet).toBeHidden();
}
