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

/** The number a `Stat` ends on, read from its screen-reader copy. */
function statValue(label: string): string {
  const strip = within(screen.getByRole('region', { name: 'Session summary' }));
  const stat = strip.getByText(label).parentElement;
  return stat?.querySelector('.sr-only')?.textContent ?? '';
}

beforeEach(async () => {
  await i18n.changeLanguage('en');
  Object.values(api).forEach((fn) => {
    fn.mockReset();
  });
  resetDb(api);
  mocks.players.mockReturnValue(queryResult({ data: makePlayers(3) }));
});

describe('the summary strip', () => {
  it('counts who is present, the average effort, the attempts and who has not been seen', async () => {
    db.attendance = [
      { player_id: 'p1', status: 'present', minutes: 60, rpe: 6 },
      { player_id: 'p2', status: 'present', minutes: 60, rpe: 8 },
      { player_id: 'p3', status: 'absent', minutes: null, rpe: null },
    ];
    db.observations = [{ player_id: 'p1', attempts: 4, successes: 2 }];
    renderSession();
    await screen.findByRole('region', { name: 'Session summary' });
    await waitFor(() => {
      expect(statValue('Present')).toBe('2');
    });
    expect(screen.getByText('of 3 expected')).toBeInTheDocument();
    expect(statValue('Average effort')).toBe('7.0');
    expect(screen.getByText('ratings: 2')).toBeInTheDocument();
    expect(statValue('Attempts seen')).toBe('4');
    expect(statValue('Not observed yet')).toBe('1');
  });

  it('shows a dash for the average until somebody is rated', async () => {
    renderSession();
    await screen.findByRole('region', { name: 'Session summary' });
    expect(statValue('Average effort')).toBe('–');
    expect(statValue('Present')).toBe('0');
  });

  it('follows the taps: a new present player is not observed until an attempt is counted', async () => {
    renderSession();
    const user = userEvent.setup();
    await screen.findByRole('radiogroup', { name: 'Player 1' });
    await user.click(presentFor('Player 1'));
    await waitFor(() => {
      expect(statValue('Present')).toBe('1');
    });
    expect(statValue('Not observed yet')).toBe('1');
    await user.click(await screen.findByRole('button', { name: 'Add an attempt for Player 1' }));
    await waitFor(() => {
      expect(statValue('Not observed yet')).toBe('0');
    });
    expect(statValue('Attempts seen')).toBe('1');
  });
});

describe('when a save fails', () => {
  const addAttempt = () => screen.getByRole('button', { name: 'Add an attempt for Player 1' });
  const removeAttempt = () =>
    screen.getByRole('button', { name: 'Remove an attempt for Player 1' });

  async function openPresentPlayer() {
    renderSession();
    const user = userEvent.setup();
    await screen.findByRole('radiogroup', { name: 'Player 1' });
    await user.click(presentFor('Player 1'));
    await screen.findByRole('button', { name: 'Add an attempt for Player 1' });
    return user;
  }

  it('puts the player back and says so when a save fails', async () => {
    db.failWrites = true;
    renderSession();
    await screen.findByRole('radiogroup', { name: 'Player 1' });
    await userEvent.setup().click(presentFor('Player 1'));
    expect(await screen.findByText('Something went wrong. Try again.')).toBeInTheDocument();
    await waitFor(() => {
      expect(presentFor('Player 1')).not.toBeChecked();
    });
    expect(screen.queryByText('Minutes played')).not.toBeInTheDocument();
  });

  it('puts a rating back to what it was, not to nothing', async () => {
    const user = await openPresentPlayer();
    await user.click(screen.getByRole('button', { name: 'Effort 6 for Player 1' }));
    await waitFor(() => {
      expect(db.attendance[0]?.rpe).toBe(6);
    });
    db.failWrites = true;
    await user.click(screen.getByRole('button', { name: 'Effort 9 for Player 1' }));
    expect(await screen.findByText('Something went wrong. Try again.')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Effort 6 for Player 1' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });
    expect(screen.getByRole('button', { name: 'Effort 9 for Player 1' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('puts a count back to what it was, not to zero', async () => {
    const user = await openPresentPlayer();
    await user.click(addAttempt());
    await waitFor(() => {
      expect(db.observations[0]?.attempts).toBe(1);
    });
    db.failWrites = true;
    await user.click(addAttempt());
    expect(await screen.findByText('Something went wrong. Try again.')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('Attempts').parentElement).toHaveTextContent('1');
    });
    expect(removeAttempt()).toBeEnabled();
  });
});
