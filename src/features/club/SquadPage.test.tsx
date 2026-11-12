import type { UseQueryResult } from '@tanstack/react-query';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import { useActiveClub } from '../../lib/club';
import { usePlayers, type Player } from '../../lib/data';
import { erasePlayer, updatePlayer } from './api';
import { SquadPage } from './SquadPage';
import { CLUB, makePlayer, queryResult, renderScreen } from './test-utils';

vi.mock('./api');
vi.mock('../../lib/club', () => ({ useActiveClub: vi.fn(), useClub: vi.fn() }));
vi.mock('../../lib/data', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/data')>()),
  usePlayers: vi.fn(),
}));

const SOKO = makePlayer();
const VUK = makePlayer({
  id: 'p-2',
  label: 'Vuk',
  shirt_number: 9,
  consent: 'withdrawn',
  birth_quarter: null,
});
const IRIS = makePlayer({
  id: 'p-3',
  label: 'Iskra',
  shirt_number: 4,
  consent: 'not_recorded',
  birth_quarter: 4,
});

function setup(options: { role?: typeof CLUB.role; roster?: UseQueryResult<Player[]> } = {}) {
  vi.mocked(useActiveClub).mockReturnValue({ ...CLUB, role: options.role ?? 'owner' });
  vi.mocked(usePlayers).mockReturnValue(
    options.roster ?? queryResult({ kind: 'success', data: [SOKO, VUK, IRIS] }),
  );
  return renderScreen(<SquadPage />, '/club/squad');
}

beforeEach(async () => {
  vi.resetAllMocks();
  await i18n.changeLanguage('en');
});

describe('SquadPage states', () => {
  it('shows a loading status while the squad loads', () => {
    setup({ roster: queryResult({ kind: 'pending' }) });
    expect(screen.getByRole('heading', { level: 1, name: 'Squad' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Loading');
  });

  it('explains a failure and retries', async () => {
    const refetch = vi.fn();
    setup({ roster: queryResult({ kind: 'error', error: { code: '42501' }, refetch }) });
    expect(screen.getByRole('alert')).toHaveTextContent('This could not be loaded.');
    expect(screen.getByRole('alert')).toHaveTextContent('You do not have permission to do that.');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('invites the first player when the squad is empty', async () => {
    setup({ roster: queryResult({ kind: 'success', data: [] }) });
    expect(screen.getByText('No players yet')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Add a player' }));
    expect(screen.getByRole('dialog', { name: 'Add a player' })).toBeInTheDocument();
  });

  it('tells a viewer who can add players instead of offering to', () => {
    setup({ role: 'viewer', roster: queryResult({ kind: 'success', data: [] }) });
    expect(screen.getByText(/The club's owner or a coach can add them/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add a player' })).not.toBeInTheDocument();
  });

  it('lists the squad with consent and birth quarter in words', () => {
    setup();
    const table = screen.getByRole('table', { name: 'Squad of Under-13s' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(3);
    // Sorted by shirt number: 4, 7, 9.
    expect(within(rows[0] as HTMLElement).getByText('Iskra')).toBeInTheDocument();
    expect(within(rows[0] as HTMLElement).getByText('Not recorded')).toBeInTheDocument();
    expect(within(rows[0] as HTMLElement).getByText('Q4')).toBeInTheDocument();
    expect(within(rows[1] as HTMLElement).getByText('Granted')).toBeInTheDocument();
    expect(within(rows[2] as HTMLElement).getByText('Withdrawn')).toBeInTheDocument();
    expect(
      within(rows[2] as HTMLElement).getByRole('img', { name: 'Not given' }),
    ).toBeInTheDocument();
  });

  it('is read-only for an assistant, with the reason', () => {
    setup({ role: 'assistant' });
    expect(
      screen.getByText(/Only the club's owner and coaches can change the squad/),
    ).toBeInTheDocument();
    expect(screen.getByText('Soko')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Edit|Archive|Erase|Add a player/ })).toBeNull();
  });

  it('speaks Bosnian', async () => {
    await i18n.changeLanguage('bs');
    setup();
    expect(screen.getByRole('heading', { level: 1, name: 'Ekipa' })).toBeInTheDocument();
    expect(screen.getByText('Povučena')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Uredi: Soko' })).toBeInTheDocument();
  });
});

describe('archiving and erasing', () => {
  it('archives after a confirmation that says what stays', async () => {
    vi.mocked(updatePlayer).mockResolvedValue();
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('button', { name: 'Archive Soko' }));
    const dialog = screen.getByRole('dialog', { name: 'Archive Soko?' });
    expect(dialog).toHaveTextContent('shirt number 7 becomes free again');
    expect(dialog).toHaveTextContent('stay in the history');
    expect(updatePlayer).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Archive' }));
    await waitFor(() => {
      expect(updatePlayer).toHaveBeenCalledWith('club-1', 'p-1', {
        archived_at: expect.any(String) as string,
      });
    });
    expect(await screen.findByText('Archived: Soko.')).toBeInTheDocument();
  });

  it('says exactly what an erase removes and keeps, and cannot be undone', async () => {
    vi.mocked(erasePlayer).mockResolvedValue();
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('button', { name: 'Erase Soko permanently' }));
    const dialog = screen.getByRole('dialog', { name: 'Erase Soko permanently?' });
    expect(within(dialog).getByText('What is deleted')).toBeInTheDocument();
    expect(within(dialog).getByText('Minutes played in matches')).toBeInTheDocument();
    expect(within(dialog).getByText('Training attendance and effort ratings')).toBeInTheDocument();
    expect(within(dialog).getByText('Observation counts')).toBeInTheDocument();
    expect(within(dialog).getByText('What stays')).toBeInTheDocument();
    expect(
      within(dialog).getByText(/Match events .* lose the link to this player/),
    ).toBeInTheDocument();
    expect(within(dialog).getByText('This cannot be undone.')).toBeInTheDocument();
    expect(erasePlayer).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Erase permanently' }));
    await waitFor(() => {
      expect(erasePlayer).toHaveBeenCalledWith('club-1', 'p-1');
    });
    expect(await screen.findByText('Erased: Soko.')).toBeInTheDocument();
  });

  it('does nothing when the coach cancels', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('button', { name: 'Erase Vuk permanently' }));
    await user.click(
      within(screen.getByRole('dialog', { name: /Erase Vuk/ })).getByRole('button', {
        name: 'Cancel',
      }),
    );
    expect(erasePlayer).not.toHaveBeenCalled();
  });

  it('shows a failed erase as a toast', async () => {
    vi.mocked(erasePlayer).mockRejectedValue({ code: '42501' });
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('button', { name: 'Erase Soko permanently' }));
    await user.click(
      within(screen.getByRole('dialog', { name: /Erase Soko/ })).getByRole('button', {
        name: 'Erase permanently',
      }),
    );
    expect(await screen.findByText('You do not have permission to do that.')).toBeInTheDocument();
  });
});
