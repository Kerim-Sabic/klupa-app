import { screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchTeamAttendance } from './api';
import { setLanguage } from '../../ui/testUtils';
import { attendance, player, renderInsights, rowCells, seed, stint } from './testKit';

vi.mock('./api');
vi.mock('../../lib/club', () => ({
  useActiveClub: () => ({ clubId: 'club-1', teamId: 'team-1' }),
}));
vi.mock('../../lib/data', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/data')>()),
  usePlayers: vi.fn(),
  useSessions: vi.fn(),
}));

const history = (id: string) => [
  attendance(id, 'w3', '2026-10-20', { minutes: 60, rpe: 5 }),
  attendance(id, 'w2', '2026-10-27', { minutes: 60, rpe: 5 }),
  attendance(id, 'w1', '2026-11-03', { minutes: 60, rpe: 5 }),
];

const evidence = {
  players: [player(1), player(2), player(3), player(4), player(5)],
  stints: [stint('p1', 0, 30, '2026-11-10'), stint('p1', 0, null, '2026-11-10')],
  attendance: [
    ...history('p1'),
    attendance('p1', 'w0', '2026-11-10', { minutes: 90, rpe: 6 }),
    ...history('p2'),
    attendance('p2', 'w0', '2026-11-10', { minutes: 60, rpe: 5 }),
    attendance('p3', 'w0', '2026-11-10', { minutes: 60, rpe: null }),
    attendance('p5', 'w0', '2026-11-10', { minutes: 60, rpe: 5 }),
    attendance('p5', 'y', '2026-11-10', { minutes: null, rpe: 5 }),
  ],
};

beforeEach(async () => {
  // Wednesday 11 November 2026; only the date is faked so queries and timers keep running.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 11, 12, 0, 0));
  await setLanguage('en');
  seed();
});

afterEach(() => {
  vi.useRealTimers();
});

async function table(): Promise<HTMLElement> {
  return screen.findByRole('table', {
    name: "Training load this week, compared with each player's recent weeks",
  });
}

describe('LoadView states', () => {
  it('shows a loading state', () => {
    seed({ players: 'loading' });
    renderInsights('/fairness/load');
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });

  it('shows an error with a retry', async () => {
    seed(evidence);
    vi.mocked(fetchTeamAttendance).mockRejectedValueOnce(new Error('offline'));
    const { user } = renderInsights('/fairness/load');
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await table()).toBeInTheDocument();
  });

  it('asks for a squad first', async () => {
    renderInsights('/fairness/load');
    expect(await screen.findByText('No players yet')).toBeInTheDocument();
  });

  it('says no load is recorded yet, but still shows the callout', async () => {
    seed({ players: [player(1)] });
    renderInsights('/fairness/load');
    expect(await screen.findByText('No training load recorded yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to training' })).toHaveAttribute(
      'href',
      '/training',
    );
    expect(screen.getByRole('note')).toBeInTheDocument();
  });
});

describe('LoadView success', () => {
  beforeEach(() => {
    seed(evidence);
  });

  it('opens with the callout that says load shows change and cannot predict injury', async () => {
    renderInsights('/fairness/load');
    await table();
    expect(screen.getByRole('note')).toHaveTextContent(
      'Load is minutes times how hard the player said it was. It shows change, not risk. It cannot predict injury.',
    );
  });

  it('shows load, the change against recent weeks, sessions, status and match minutes', async () => {
    renderInsights('/fairness/load');
    const loads = await table();
    const cells = (name: string) => rowCells(loads, name);
    expect(cells('Player 1').slice(1, 4)).toEqual(['540', '+80%', '1']);
    expect(cells('Player 1')[4]).toContain('Sharp increase');
    expect(cells('Player 1')[4]).toContain('worth a conversation with the player');
    expect(cells('Player 1')[5]).toBe('30');
    expect(cells('Player 2').slice(1, 4)).toEqual(['300', '0%', '1']);
    expect(cells('Player 2')[4]).toContain('Steady');
    expect(cells('Player 3')[2]).toBe('–');
    expect(cells('Player 3')[4]).toContain('Ratings incomplete');
    expect(cells('Player 3')[4]).toContain('no comparison is made');
    expect(cells('Player 4')[1]).toBe('–');
    expect(cells('Player 4')[4]).toContain('No data this week');
    expect(cells('Player 5')[4]).toContain('Not enough history');
    expect(cells('Player 2')[5]).toBe('0');
  });

  it('sorts by every column without losing a row', async () => {
    const { user } = renderInsights('/fairness/load');
    const loads = await table();
    for (const button of within(loads).getAllByRole('button')) {
      await user.click(button);
      expect(within(loads).getAllByRole('row')).toHaveLength(6);
    }
  });

  it('says match minutes are context only and not part of the load', async () => {
    renderInsights('/fairness/load');
    await table();
    expect(
      screen.getByText(
        /No effort rating is collected for matches, so they are not part of the load/,
      ),
    ).toBeInTheDocument();
  });

  it('charts the squad total for the last six weeks with a text alternative', async () => {
    renderInsights('/fairness/load');
    await table();
    const chart = screen.getByRole('img', { name: /^Squad load by week\./ });
    expect(chart).toHaveTextContent('week of 5 Oct 2026: 0, players with a session: 0');
    expect(chart).toHaveTextContent('week of 9 Nov 2026: 1,140, players with a session: 4');
    expect(within(chart).getAllByText(/^\d+ (Oct|Nov) 2026$/)).toHaveLength(6);
    expect(screen.getByText(/The last bar is this week so far/)).toBeInTheDocument();
  });

  it('says what was left out', async () => {
    renderInsights('/fairness/load');
    await table();
    expect(screen.getByText(/1 attendance mark has no minutes recorded/)).toBeInTheDocument();
  });

  it('shows Bosnian status words and leaves no key untranslated', async () => {
    await setLanguage('bs');
    renderInsights('/fairness/load');
    const loads = await screen.findByRole('table');
    expect(rowCells(loads, 'Player 1')[4]).toContain('Nagli porast');
    expect(rowCells(loads, 'Player 1')[2]).toBe('+80%');
    expect(document.body.textContent).not.toMatch(/insights\./);
    await setLanguage('en');
  });
});
