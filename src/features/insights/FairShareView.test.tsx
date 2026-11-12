import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import { setLanguage } from '../../ui/testUtils';
import { fetchTeamStints } from './api';
import {
  attendance,
  observation,
  player,
  renderInsights,
  rowCells,
  seed,
  statValue,
  stint,
} from './testKit';

vi.mock('./api');
vi.mock('../../lib/club', () => ({
  useActiveClub: () => ({ clubId: 'club-1', teamId: 'team-1' }),
}));
vi.mock('../../lib/data', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/data')>()),
  usePlayers: vi.fn(),
  useSessions: vi.fn(),
}));

const quarters = [1, 1, 1, 1, 1, 2, 3, 3, 4, 4];
const squad = quarters.map((quarter, index) => player(index + 1, quarter));

const evidence = {
  players: squad,
  stints: [stint('p1', 0, 30), stint('p2', 0, 30), stint('p3', 10, 25), stint('p4', 20, null)],
  attendance: [
    attendance('p1', 's1', '2026-11-02', { minutes: 60 }),
    attendance('p1', 's2', '2026-11-04', { minutes: 30 }),
    attendance('p2', 's1', '2026-11-02', { minutes: null }),
  ],
  observations: [
    observation('p1', 's1', 10, 7),
    observation('p1', 's2', 6, 4),
    observation('p1', 's3', 4, 3),
    observation('p2', 's1', 2, 2),
  ],
};

beforeEach(async () => {
  await setLanguage('en');
  seed();
});

async function ledger(): Promise<HTMLElement> {
  return screen.findByRole('table', {
    name: 'Match minutes, training minutes and what was observed, for each player',
  });
}

describe('FairShareView states', () => {
  it('shows a loading state while the reads are pending', () => {
    seed({ players: 'loading' });
    renderInsights();
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });

  it('shows an error with a retry that asks again and then shows the view', async () => {
    seed(evidence);
    vi.mocked(fetchTeamStints).mockRejectedValueOnce(new Error('offline'));
    const { user } = renderInsights();
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load this view');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await ledger()).toBeInTheDocument();
    expect(fetchTeamStints).toHaveBeenCalledTimes(2);
  });

  it('asks for a squad first when there are no players', async () => {
    renderInsights();
    expect(await screen.findByText('No players yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open the squad' })).toHaveAttribute(
      'href',
      '/club/squad',
    );
  });

  it('says nothing is recorded yet, and what was left out, when only open stints exist', async () => {
    seed({ players: squad, stints: [stint('p1', 0, null)] });
    renderInsights();
    expect(await screen.findByText('Nothing recorded yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to matches' })).toHaveAttribute('href', '/matches');
    expect(screen.getByText(/1 stint is still open/)).toBeInTheDocument();
  });
});

describe('FairShareView success', () => {
  beforeEach(() => {
    seed(evidence);
  });

  it('shows three stats, with the Gini in words and the number as the hint', async () => {
    renderInsights();
    await ledger();
    expect(statValue('Players with match minutes')).toBe('3 of 10');
    expect(statValue('How evenly match minutes were shared')).toBe('Very uneven');
    expect(
      screen.getByText(/Gini coefficient 0\.\d\d, where 0 is perfectly even/),
    ).toBeInTheDocument();
    expect(statValue('Not yet properly observed')).toBe('9');
  });

  it('lists who has not had a fair look, and says it is not a ranking', async () => {
    renderInsights();
    await ledger();
    expect(
      screen.getByText('This is a list of who has not had a fair look yet. It is not a ranking.'),
    ).toBeInTheDocument();
    const section = screen.getByRole('region', { name: 'Second look' });
    const cards = within(section).getAllByRole('listitem');
    expect(cards).toHaveLength(9);
    expect(within(section).queryByText('Player 1')).not.toBeInTheDocument();
    const twoFromTwo = cards.find((card) => card.textContent.includes('Player 2'));
    expect(twoFromTwo).toHaveTextContent('2 attempts observed in 1 session');
    const unseen = cards.find((card) => card.textContent.includes('Player 8'));
    expect(unseen).toHaveTextContent('No attempts observed yet');
    expect(unseen).toHaveTextContent('No match minutes yet');
    expect(twoFromTwo).not.toHaveTextContent('No match minutes yet');
  });

  it('shows the ledger with signed minutes, counts beside rates, and an interval bar per player', async () => {
    renderInsights();
    const table = await ledger();
    expect(rowCells(table, 'Player 2').slice(1, 7)).toEqual([
      '30',
      '40%',
      '+22.5',
      '0',
      '2',
      '100% (2 of 2)',
    ]);
    expect(rowCells(table, 'Player 1')[4]).toBe('90');
    expect(rowCells(table, 'Player 10').slice(1, 4)).toEqual(['0', '0%', '-7.5']);
    expect(rowCells(table, 'Player 10')[6]).toBe('None observed');
    const bars = screen.getAllByRole('img', { name: /^Adjusted rate/ });
    expect(bars).toHaveLength(10);
    expect(
      screen.getByRole('img', {
        name: /Adjusted rate 77%, likely between \d+%–\d+% \(90% range\)/,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Small samples are pulled towards the squad average, because two from two/),
    ).toBeInTheDocument();
  });

  it('draws the widest bar for the player who has been watched least', async () => {
    renderInsights();
    await ledger();
    const lowHigh = (name: RegExp): number[] => {
      const label = screen.getByRole('img', { name }).textContent;
      const [low = 0, high = 0] = (/(\d+)%–(\d+)%/.exec(label) ?? []).slice(1).map(Number);
      return [low, high];
    };
    const [twoLow = 0, twoHigh = 0] = lowHigh(/^Adjusted rate 77%/);
    expect(twoHigh - twoLow).toBeGreaterThan(30);
  });

  it('shows the relative-age verdict in words with the low-power caveat and two charts', async () => {
    renderInsights();
    await ledger();
    const section = screen.getByRole('region', { name: 'Relative age' });
    expect(within(section).getByText('Leans towards older players')).toBeInTheDocument();
    expect(within(section).getByText(/this check has low power/)).toBeInTheDocument();
    expect(within(section).getByText(/Exact test: p = 0\.366\./)).toBeInTheDocument();
    expect(
      within(section).getByRole('img', { name: /^Players by birth quarter\. Q1: 50%/ }),
    ).toBeInTheDocument();
    expect(
      within(section).getByRole('img', {
        name: /^Share of match minutes by birth quarter\. Q1: 100%/,
      }),
    ).toBeInTheDocument();
    expect(
      within(section).getByText('Based on 10 players with a birth quarter.'),
    ).toBeInTheDocument();
  });

  it('sorts by every column without losing a row', async () => {
    const { user } = renderInsights();
    const table = await ledger();
    for (const button of within(table).getAllByRole('button')) {
      await user.click(button);
      expect(within(table).getAllByRole('row')).toHaveLength(11);
    }
  });

  it('says what was left out', async () => {
    renderInsights();
    await ledger();
    expect(screen.getByText(/1 stint is still open/)).toBeInTheDocument();
    expect(screen.getByText(/1 attendance mark has no minutes recorded/)).toBeInTheDocument();
  });

  it('sorts the ledger when a column header is pressed', async () => {
    const { user } = renderInsights();
    const table = await ledger();
    await user.click(within(table).getByRole('button', { name: /Match minutes/ }));
    await user.click(within(table).getByRole('button', { name: /Match minutes/ }));
    const body = within(table).getAllByRole('rowgroup')[1];
    const first = body === undefined ? null : within(body).getAllByRole('row')[0];
    expect(first).toHaveTextContent('Player 1');
  });
});

describe('FairShareView edge cases', () => {
  it('asks for birth quarters when fewer than eight players have one', async () => {
    seed({
      players: [player(1, 1), player(2), player(3)],
      stints: [stint('p1', 0, 30)],
    });
    renderInsights();
    expect(await screen.findByText('Add birth quarters to see this')).toBeInTheDocument();
    expect(screen.getByText(/at least 8 players, and 1 have one so far/)).toBeInTheDocument();
    const links = screen.getAllByRole('link', { name: 'Open the squad' });
    expect(links[0]).toHaveAttribute('href', '/club/squad');
  });

  it('says so when everyone has been observed enough', async () => {
    seed({
      players: [player(1), player(2)],
      stints: [stint('p1', 0, 30), stint('p2', 0, 30)],
      observations: [observation('p1', 's1', 8, 4), observation('p2', 's1', 6, 3)],
    });
    renderInsights();
    expect(
      await screen.findByText('Everyone has at least 5 attempts observed.'),
    ).toBeInTheDocument();
    expect(statValue('Not yet properly observed')).toBe('0');
  });

  it('says there is nothing to compare by quarter when nobody has played', async () => {
    seed({ players: squad, observations: [observation('p1', 's1', 5, 5)] });
    renderInsights();
    expect(
      await screen.findByText(/No match minutes yet, so there is nothing to compare/),
    ).toBeInTheDocument();
    expect(statValue('How evenly match minutes were shared')).toBe('No minutes yet');
    expect(screen.getByText('No finished match minutes to compare')).toBeInTheDocument();
  });

  it('notes players with no birth quarter, and draws no bar range when the squad rate is 1', async () => {
    seed({
      players: [...squad, player(11)],
      stints: [stint('p1', 0, 30)],
      observations: [observation('p1', 's1', 5, 5)],
    });
    renderInsights();
    await ledger();
    expect(screen.getByText(/1 player without one is left out\./)).toBeInTheDocument();
    expect(
      screen.getAllByRole('img', { name: 'Adjusted rate 100%, no range can be drawn' }).length,
    ).toBeGreaterThan(0);
  });
});

describe('FairShareView in Bosnian', () => {
  it('uses Bosnian text and decimal commas, with no untranslated key left on the page', async () => {
    seed(evidence);
    await setLanguage('bs');
    renderInsights();
    await screen.findByRole('table');
    expect(screen.getByRole('heading', { name: 'Drugi pogled' })).toBeInTheDocument();
    expect(screen.getByText(/Ginijev koeficijent 0,\d\d/)).toBeInTheDocument();
    expect(statValue('Koliko su ravnomjerno podijeljene minute')).toBe('Veoma neravnomjerno');
    expect(screen.getByText(/2 pokušaja zabilježeno na 1 treningu/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/insights\./);
    await i18n.changeLanguage('en');
  });

  it('leaves no untranslated key in English either', async () => {
    seed(evidence);
    renderInsights();
    await ledger();
    expect(document.body.textContent).not.toMatch(/insights\./);
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'The ledger' })).toBeInTheDocument();
    });
  });
});
