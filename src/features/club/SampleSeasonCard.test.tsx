import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import { useActiveClub } from '../../lib/club';
import { countActivePlayers } from './api';
import { SampleSeasonCard } from './SampleSeasonCard';
import { CLUB, renderScreen } from './test-utils';
import { writeSeason, type SeasonSummary } from './writeSeason';

vi.mock('./api');
vi.mock('../../lib/club', () => ({ useActiveClub: vi.fn(), useClub: vi.fn() }));
vi.mock('./writeSeason', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./writeSeason')>()),
  writeSeason: vi.fn(),
}));

const SUMMARY: SeasonSummary = { players: 14, matches: 3, events: 96, sessions: 5 };

function setup() {
  vi.mocked(useActiveClub).mockReturnValue({ ...CLUB, isDemo: true });
  return renderScreen(<SampleSeasonCard />, '/club');
}

/** A write that stays open until the test lets it finish, so the waiting state can be seen. */
function slowWrite() {
  let finish: (summary: SeasonSummary) => void = () => undefined;
  let fail: (error: unknown) => void = () => undefined;
  vi.mocked(writeSeason).mockImplementation(
    () =>
      new Promise<SeasonSummary>((resolve, reject) => {
        finish = resolve;
        fail = reject;
      }),
  );
  return {
    finish: (summary: SeasonSummary) => {
      finish(summary);
    },
    fail: (error: unknown) => {
      fail(error);
    },
  };
}

beforeEach(async () => {
  vi.resetAllMocks();
  vi.mocked(countActivePlayers).mockResolvedValue(0);
  await i18n.changeLanguage('en');
});

describe('SampleSeasonCard', () => {
  it('explains what the sample is and offers it', () => {
    setup();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Load the sample season' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/14 players with nicknames, 3 matches and 5 training sessions/),
    ).toBeInTheDocument();
    expect(screen.getByText(/deleted with the demo club after a week/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Load the sample season' })).toBeEnabled();
  });

  it('says it is working while the season is stored, then confirms with a toast', async () => {
    const write = slowWrite();
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('button', { name: 'Load the sample season' }));

    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('Adding the squad, three matches and five training sessions');
    expect(
      screen.queryByRole('button', { name: 'Load the sample season' }),
    ).not.toBeInTheDocument();

    write.finish(SUMMARY);
    expect(
      await screen.findByText('Sample season loaded. Players: 14, matches: 3, sessions: 5.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Load the sample season' })).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('writes the season for this club and team, with the fixed seed', async () => {
    vi.mocked(writeSeason).mockResolvedValue(SUMMARY);
    setup();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Load the sample season' }));
    await waitFor(() => {
      expect(writeSeason).toHaveBeenCalledTimes(1);
    });
    const [data, club] = vi.mocked(writeSeason).mock.calls[0] ?? [];
    expect(club).toEqual({ clubId: 'club-1', teamId: 'team-1' });
    expect(data?.players).toHaveLength(14);
    expect(data?.matches).toHaveLength(3);
    expect(data?.sessions).toHaveLength(5);
  });

  it('refuses to run when the squad is no longer empty', async () => {
    vi.mocked(countActivePlayers).mockResolvedValue(3);
    setup();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Load the sample season' }));
    expect(
      await screen.findByText('The squad already has players, so nothing was added.'),
    ).toBeInTheDocument();
    expect(writeSeason).not.toHaveBeenCalled();
  });

  it('says what went wrong and lets the coach try again', async () => {
    const write = slowWrite();
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('button', { name: 'Load the sample season' }));
    await screen.findByRole('status');
    write.fail(new TypeError('offline'));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('could not be loaded, so nothing was added');
    expect(alert).toHaveTextContent('No connection');

    vi.mocked(writeSeason).mockResolvedValue(SUMMARY);
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText(/Sample season loaded/)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  it('speaks Bosnian', async () => {
    await i18n.changeLanguage('bs');
    vi.mocked(writeSeason).mockResolvedValue(SUMMARY);
    setup();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Učitaj probnu sezonu' }));
    expect(
      await screen.findByText('Probna sezona je učitana. Igrači: 14, utakmice: 3, treninzi: 5.'),
    ).toBeInTheDocument();
  });
});
