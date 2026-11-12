import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import { SessionPage } from './SessionPage';
import { db, resetDb } from './session-fixtures';
import { CLUB, SESSION_ID, makePlayers, queryResult, renderAt } from './test-utils';

const mocks = vi.hoisted(() => ({
  players: vi.fn(),
  api: {
    fetchSession: vi.fn(),
    fetchAttendance: vi.fn(),
    fetchObservations: vi.fn(),
    insertSession: vi.fn(),
    updateSessionStatus: vi.fn(),
    upsertAttendance: vi.fn(),
    upsertObservation: vi.fn(),
  },
}));

vi.mock('../../lib/club', () => ({ useActiveClub: () => CLUB }));
vi.mock('../../lib/data', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/data')>()),
  usePlayers: () => mocks.players() as unknown,
}));
vi.mock('./api', () => mocks.api);

const api = mocks.api;

function renderSession(id: string = SESSION_ID) {
  return renderAt(`/training/${id}`, [
    { path: '/training/:sessionId', element: <SessionPage /> },
    { path: '/training', element: <p>sessions list</p> },
  ]);
}

const group = (name: string) => screen.getByRole('radiogroup', { name });
const presentFor = (name: string) => within(group(name)).getByRole('radio', { name: 'Present' });

beforeEach(async () => {
  await i18n.changeLanguage('en');
  Object.values(api).forEach((fn) => {
    fn.mockReset();
  });
  resetDb(api);
  mocks.players.mockReturnValue(queryResult({ data: makePlayers(3) }));
});

describe('attendance', () => {
  it('lists every player with shirt number and label, none chosen yet', async () => {
    renderSession();
    expect(await screen.findByRole('radiogroup', { name: 'Player 1' })).toBeInTheDocument();
    expect(screen.getAllByRole('radiogroup')).toHaveLength(3);
    expect(presentFor('Player 1')).not.toBeChecked();
    expect(within(group('Player 1')).getByRole('radio', { name: 'Absent' })).not.toBeChecked();
    expect(screen.queryByText('Minutes played')).not.toBeInTheDocument();
  });

  it('marks a player present for the whole session and saves at once', async () => {
    renderSession();
    await screen.findByRole('radiogroup', { name: 'Player 1' });
    await userEvent.setup().click(presentFor('Player 1'));
    await waitFor(() => {
      expect(api.upsertAttendance).toHaveBeenCalledWith('club-1', SESSION_ID, 'p1', {
        status: 'present',
        minutes: 60,
        rpe: null,
      });
    });
    expect(presentFor('Player 1')).toBeChecked();
    expect(screen.getByText('Minutes played')).toBeInTheDocument();
  });

  it('changes the minutes in steps of five', async () => {
    renderSession();
    const user = userEvent.setup();
    await screen.findByRole('radiogroup', { name: 'Player 1' });
    await user.click(presentFor('Player 1'));
    await user.click(await screen.findByRole('button', { name: 'Five minutes less for Player 1' }));
    await waitFor(() => {
      expect(api.upsertAttendance).toHaveBeenLastCalledWith('club-1', SESSION_ID, 'p1', {
        status: 'present',
        minutes: 55,
        rpe: null,
      });
    });
  });

  it('rates the effort 1 to 10 with anchors and a helper line, and clears a rating tapped twice', async () => {
    renderSession();
    const user = userEvent.setup();
    await screen.findByRole('radiogroup', { name: 'Player 1' });
    await user.click(presentFor('Player 1'));
    const chips = within(await screen.findByRole('group', { name: 'Effort for Player 1' }));
    expect(chips.getAllByRole('button')).toHaveLength(10);
    expect(chips.getByText('1 · easy')).toBeInTheDocument();
    expect(chips.getByText('10 · maximal')).toBeInTheDocument();
    expect(chips.getByText('How hard was it for them? Ask the player.')).toBeInTheDocument();

    await user.click(chips.getByRole('button', { name: 'Effort 7 for Player 1' }));
    await waitFor(() => {
      expect(api.upsertAttendance).toHaveBeenLastCalledWith('club-1', SESSION_ID, 'p1', {
        status: 'present',
        minutes: 60,
        rpe: 7,
      });
    });
    expect(chips.getByRole('button', { name: 'Effort 7 for Player 1' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await user.click(chips.getByRole('button', { name: 'Effort 7 for Player 1' }));
    await waitFor(() => {
      expect(api.upsertAttendance).toHaveBeenLastCalledWith('club-1', SESSION_ID, 'p1', {
        status: 'present',
        minutes: 60,
        rpe: null,
      });
    });
  });

  it('clears minutes and effort when the player turns out absent', async () => {
    db.attendance = [{ player_id: 'p1', status: 'present', minutes: 50, rpe: 6 }];
    renderSession();
    const user = userEvent.setup();
    await screen.findByRole('radiogroup', { name: 'Player 1' });
    await waitFor(() => {
      expect(presentFor('Player 1')).toBeChecked();
    });
    await user.click(within(group('Player 1')).getByRole('radio', { name: 'Absent' }));
    await waitFor(() => {
      expect(api.upsertAttendance).toHaveBeenLastCalledWith('club-1', SESSION_ID, 'p1', {
        status: 'absent',
        minutes: null,
        rpe: null,
      });
    });
    expect(screen.queryByRole('group', { name: 'Effort for Player 1' })).not.toBeInTheDocument();
  });

  it('tells you to add players when the squad is empty', async () => {
    mocks.players.mockReturnValue(queryResult({ data: [] }));
    renderSession();
    expect(await screen.findByText('No players in the squad yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to the club page' })).toHaveAttribute(
      'href',
      '/club',
    );
  });
});

describe('attempts and successes', () => {
  async function presentAndOpen() {
    renderSession();
    const user = userEvent.setup();
    await screen.findByRole('radiogroup', { name: 'Player 1' });
    await user.click(presentFor('Player 1'));
    await screen.findByRole('button', { name: 'Add an attempt for Player 1' });
    return user;
  }

  const addAttempt = () => screen.getByRole('button', { name: 'Add an attempt for Player 1' });
  const removeAttempt = () =>
    screen.getByRole('button', { name: 'Remove an attempt for Player 1' });
  const addSuccess = () => screen.getByRole('button', { name: 'Add a success for Player 1' });
  const removeSuccess = () => screen.getByRole('button', { name: 'Remove a success for Player 1' });

  it('counts attempts and saves each tap against the session focus', async () => {
    const user = await presentAndOpen();
    await user.click(addAttempt());
    await user.click(addAttempt());
    await waitFor(() => {
      expect(api.upsertObservation).toHaveBeenLastCalledWith(
        'club-1',
        SESSION_ID,
        'p1',
        'pressing',
        {
          attempts: 2,
          successes: 0,
        },
      );
    });
    expect(api.fetchObservations).toHaveBeenCalledWith('club-1', SESSION_ID, 'pressing');
    expect(removeAttempt()).toBeEnabled();
  });

  it('never lets successes pass attempts', async () => {
    const user = await presentAndOpen();
    expect(addSuccess()).toBeDisabled();
    await user.click(addAttempt());
    await user.click(addSuccess());
    expect(addSuccess()).toBeDisabled();
    await waitFor(() => {
      expect(api.upsertObservation).toHaveBeenLastCalledWith(
        'club-1',
        SESSION_ID,
        'p1',
        'pressing',
        {
          attempts: 1,
          successes: 1,
        },
      );
    });
    expect(removeSuccess()).toBeEnabled();
  });

  it('takes successes down with attempts when attempts fall below them', async () => {
    const user = await presentAndOpen();
    await user.click(addAttempt());
    await user.click(addAttempt());
    await user.click(addSuccess());
    await user.click(addSuccess());
    await user.click(removeAttempt());
    await waitFor(() => {
      expect(api.upsertObservation).toHaveBeenLastCalledWith(
        'club-1',
        SESSION_ID,
        'p1',
        'pressing',
        {
          attempts: 1,
          successes: 1,
        },
      );
    });
    await user.click(removeAttempt());
    await waitFor(() => {
      expect(api.upsertObservation).toHaveBeenLastCalledWith(
        'club-1',
        SESSION_ID,
        'p1',
        'pressing',
        {
          attempts: 0,
          successes: 0,
        },
      );
    });
    expect(removeAttempt()).toBeDisabled();
  });
});
