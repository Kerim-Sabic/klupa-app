import type { UseQueryResult } from '@tanstack/react-query';
import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import { usePlayers, type Player } from '../../lib/data';
import * as api from './api';
import { loadClock, saveClock } from './clock';
import type { StintRow } from './model';
import { TaggerPage } from './TaggerPage';
import { dbError, makeMatch, makePlayer, makeStint, renderAt } from './testing';

vi.mock('./api');
vi.mock('../../lib/club', async () => {
  const { CLUB } = await import('./testing');
  return { useActiveClub: () => CLUB };
});
vi.mock('../../lib/data', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/data')>()),
  useMatches: vi.fn(),
  usePlayers: vi.fn(),
}));

/** Stints as the database would hold them, so refetches show every change. */
let stints: StintRow[] = [];
let nextId = 0;

function runningFor(seconds: number) {
  saveClock('match-1', {
    period: 1,
    running: true,
    elapsedMs: 0,
    startedAt: Date.now() - seconds * 1000,
    ended: false,
  });
}

function renderTagger() {
  return renderAt(<TaggerPage />, {
    path: '/matches/:matchId/live',
    route: '/matches/match-1/live',
  });
}

async function openLineup(user: ReturnType<typeof renderTagger>['user']) {
  await user.click(await screen.findByRole('button', { name: 'Lineup' }));
  return within(screen.getByRole('dialog', { name: 'Who is on the pitch' }));
}

beforeEach(async () => {
  await i18n.changeLanguage('en');
  stints = [];
  nextId = 0;
  vi.mocked(api.fetchMatch).mockResolvedValue(makeMatch({ status: 'live' }));
  vi.mocked(api.fetchEvents).mockResolvedValue([]);
  vi.mocked(api.fetchStints).mockImplementation(() => Promise.resolve([...stints]));
  vi.mocked(api.upsertEvent).mockResolvedValue();
  vi.mocked(api.setMatchStatus).mockResolvedValue();
  // The stand-in applies each step the way the database does, all in one call.
  vi.mocked(api.applyLineup).mockImplementation((_club, _match, steps) => {
    for (const step of steps) {
      if (step.type === 'on') {
        nextId += 1;
        stints.push(
          makeStint({
            id: `s-${String(nextId)}`,
            player_id: step.player,
            period: step.period,
            on_seconds: step.on_seconds,
          }),
        );
      } else if (step.type === 'off') {
        stints = stints.map((stint) =>
          stint.id === step.stint ? { ...stint, off_seconds: step.off_seconds } : stint,
        );
      } else {
        stints = stints.filter((stint) => stint.id !== step.stint);
      }
    }
    return Promise.resolve();
  });
  vi.mocked(usePlayers).mockReturnValue({
    isPending: false,
    isError: false,
    data: [makePlayer('p-7', 7, 'Lijevi bek'), makePlayer('p-3', 3, 'Golman')],
  } as unknown as UseQueryResult<Player[]>);
});

describe('lineup', () => {
  it('picks the starters before kick-off at 00:00 of the first period', async () => {
    vi.mocked(api.fetchMatch).mockResolvedValue(makeMatch({ status: 'scheduled' }));
    const { user } = renderTagger();
    const sheet = await openLineup(user);
    expect(sheet.getByText(/Pick who starts/)).toBeInTheDocument();
    expect(sheet.getAllByText('Not played yet')).toHaveLength(2);
    await user.click(sheet.getByRole('switch', { name: 'Golman, number 3' }));
    expect(api.applyLineup).toHaveBeenCalledWith('club-1', 'match-1', [
      { type: 'on', player: 'p-3', period: 1, on_seconds: 0 },
    ]);
    await waitFor(() => {
      expect(sheet.getByRole('switch', { name: 'Golman, number 3' })).toBeChecked();
    });
    expect(sheet.getAllByText('Not played yet')).toHaveLength(1);
  });

  it('shows minutes so far, lists who has not played first, and takes a player off', async () => {
    runningFor(600);
    stints = [makeStint({ id: 's-a', player_id: 'p-7', period: 1, on_seconds: 0 })];
    const { user } = renderTagger();
    const sheet = await openLineup(user);
    expect(sheet.getByText('On the pitch: 1')).toBeInTheDocument();
    const rows = sheet.getAllByRole('listitem');
    expect(within(rows[0] ?? document.body).getByText('Golman')).toBeInTheDocument();
    expect(within(rows[0] ?? document.body).getByText('Not played yet')).toBeInTheDocument();
    expect(within(rows[1] ?? document.body).getByText('10 min')).toBeInTheDocument();
    await user.click(sheet.getByRole('switch', { name: 'Lijevi bek, number 7' }));
    const [, , steps] = vi.mocked(api.applyLineup).mock.calls[0] ?? [];
    expect(steps).toEqual([
      { type: 'off', stint: 's-a', off_seconds: expect.any(Number) as number },
    ]);
    const [step] = steps ?? [];
    expect(step?.type === 'off' ? step.off_seconds : 0).toBeGreaterThanOrEqual(600);
    await waitFor(() => {
      expect(sheet.getByRole('switch', { name: 'Lijevi bek, number 7' })).not.toBeChecked();
    });
  });

  it('says so when a change could not be saved and leaves the toggle as it was', async () => {
    runningFor(60);
    vi.mocked(api.applyLineup).mockRejectedValue(new TypeError('Failed to fetch'));
    const { user } = renderTagger();
    const sheet = await openLineup(user);
    await user.click(sheet.getByRole('switch', { name: 'Golman, number 3' }));
    expect(await screen.findByText(/The lineup change was not saved/)).toBeInTheDocument();
    expect(sheet.getByRole('switch', { name: 'Golman, number 3' })).not.toBeChecked();
  });

  it('says there is no squad yet', async () => {
    vi.mocked(usePlayers).mockReturnValue({
      isPending: false,
      isError: false,
      data: [],
    } as unknown as UseQueryResult<Player[]>);
    const { user } = renderTagger();
    const sheet = await openLineup(user);
    expect(sheet.getByText('No players in the squad')).toBeInTheDocument();
  });

  it('offers a retry when the squad could not be loaded', async () => {
    const refetch = vi.fn();
    vi.mocked(usePlayers).mockReturnValue({
      isPending: false,
      isError: true,
      refetch,
    } as unknown as UseQueryResult<Player[]>);
    const { user } = renderTagger();
    const sheet = await openLineup(user);
    await user.click(sheet.getByRole('button', { name: 'Try again' }));
    expect(refetch).toHaveBeenCalled();
  });
});

describe('periods and the final whistle', () => {
  it('pauses and resumes the clock', async () => {
    runningFor(60);
    const { user } = renderTagger();
    await user.click(await screen.findByRole('button', { name: 'Pause' }));
    expect(loadClock('match-1').running).toBe(false);
    expect(screen.getByRole('button', { name: 'Corner' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Resume' }));
    expect(loadClock('match-1').running).toBe(true);
  });

  it('closes every stint at half-time and brings the same players back for the next half', async () => {
    runningFor(1500);
    stints = [
      makeStint({ id: 's-a', player_id: 'p-7', period: 1, on_seconds: 0 }),
      makeStint({ id: 's-b', player_id: 'p-3', period: 1, on_seconds: 0, off_seconds: 300 }),
    ];
    const { user } = renderTagger();
    await user.click(await screen.findByRole('button', { name: 'End period' }));
    await waitFor(() => {
      expect(api.applyLineup).toHaveBeenCalledTimes(1);
    });
    // Only the stint still open is closed, and it is one step in one call.
    expect(vi.mocked(api.applyLineup).mock.calls[0]?.[2]).toEqual([
      { type: 'off', stint: 's-a', off_seconds: expect.any(Number) as number },
    ]);
    expect(screen.getByRole('button', { name: 'Corner' })).toHaveAccessibleDescription(
      'Between periods. Start the next period to record events.',
    );
    const sheet = await openLineup(user);
    expect(sheet.getByText(/The same players go back on/)).toBeInTheDocument();
    expect(sheet.getByRole('switch', { name: 'Golman, number 3' })).toBeDisabled();
    await user.click(sheet.getByRole('button', { name: 'Close' }));

    await user.click(screen.getByRole('button', { name: 'Start period 2' }));
    await waitFor(() => {
      expect(api.applyLineup).toHaveBeenLastCalledWith('club-1', 'match-1', [
        { type: 'on', player: 'p-7', period: 2, on_seconds: 0 },
      ]);
    });
    expect(api.applyLineup).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Half 2')).toBeInTheDocument();
  });

  it('asks before finishing, then closes the match and opens the review', async () => {
    runningFor(900);
    stints = [makeStint({ id: 's-a', player_id: 'p-7', period: 1, on_seconds: 0 })];
    const { user } = renderTagger();
    await user.click(await screen.findByRole('button', { name: 'Finish match' }));
    const confirm = within(screen.getByRole('dialog', { name: 'Finish the match?' }));
    await user.click(confirm.getByRole('button', { name: 'Keep recording' }));
    expect(api.setMatchStatus).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Finish match' }));
    await user.click(
      within(screen.getByRole('dialog', { name: 'Finish the match?' })).getByRole('button', {
        name: 'Finish match',
      }),
    );
    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent(/^\/matches\/match-1$/);
    });
    expect(api.applyLineup).toHaveBeenCalledWith('club-1', 'match-1', [
      { type: 'off', stint: 's-a', off_seconds: expect.any(Number) as number },
    ]);
    expect(api.setMatchStatus).toHaveBeenCalledWith('club-1', 'match-1', 'finished');
  });

  it('keeps the final whistle on the phone when offline and stops recording', async () => {
    vi.mocked(api.fetchMatch).mockResolvedValue(makeMatch({ status: 'live', period_count: 1 }));
    saveClock('match-1', { period: 1, running: false, elapsedMs: 0, startedAt: null, ended: true });
    vi.mocked(api.setMatchStatus).mockRejectedValue(new TypeError('Failed to fetch'));
    const { user } = renderTagger();
    expect(await screen.findByRole('button', { name: 'Goal' })).toHaveAccessibleDescription(
      'Every period is over. Finish the match when you are ready.',
    );
    await user.click(screen.getByRole('button', { name: 'Finish match' }));
    await user.click(
      within(screen.getByRole('dialog', { name: 'Finish the match?' })).getByRole('button', {
        name: 'Finish match',
      }),
    );
    expect(await screen.findByText(/Saved on this phone/)).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/matches/match-1/live');
    expect(screen.getByText('This match is finished.')).toBeInTheDocument();
    expect(screen.getByText('Waiting to send: 1')).toBeInTheDocument();
  });
});

describe('loading, error and not found', () => {
  it('shows a placeholder while the match loads', () => {
    vi.mocked(api.fetchMatch).mockReturnValue(new Promise(() => undefined));
    renderTagger();
    expect(screen.getByRole('status', { name: 'Loading the match' })).toBeInTheDocument();
  });

  it('says when the match could not be loaded and retries', async () => {
    vi.mocked(api.fetchEvents).mockRejectedValueOnce(dbError('PGRST000'));
    const { user } = renderTagger();
    expect(await screen.findByText('This match could not be loaded.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('button', { name: 'Corner' })).toBeInTheDocument();
  });

  it('says when the match does not exist', async () => {
    vi.mocked(api.fetchMatch).mockResolvedValue(null);
    renderTagger();
    expect(
      await screen.findByText('This match does not exist or is not in your club.'),
    ).toBeInTheDocument();
  });
});
