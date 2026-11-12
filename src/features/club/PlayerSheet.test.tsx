import type { UseQueryResult } from '@tanstack/react-query';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import { useActiveClub } from '../../lib/club';
import { usePlayers, type Player } from '../../lib/data';
import { insertPlayer, updatePlayer } from './api';
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

describe('adding a player', () => {
  async function openAdd() {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('button', { name: 'Add a player' }));
    return { user, dialog: screen.getByRole('dialog') };
  }

  it('shows the hints that keep children out of the data', async () => {
    const { dialog } = await openAdd();
    expect(
      within(dialog).getByText('A nickname or initials. Please do not enter a full name.'),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        'Only the quarter is stored, never a birth date. It is used to check whether younger-born players get a fair share.',
      ),
    ).toBeInTheDocument();
  });

  it('refuses an empty form and says why next to each field', async () => {
    const { user, dialog } = await openAdd();
    await user.click(within(dialog).getByRole('button', { name: 'Add player' }));
    expect(within(dialog).getByText('Use between 1 and 40 characters.')).toBeInTheDocument();
    expect(within(dialog).getByText('Enter a whole number from 1 to 99.')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Label')).toHaveAttribute('aria-invalid', 'true');
    expect(insertPlayer).not.toHaveBeenCalled();
  });

  it('refuses a label over 40 characters', async () => {
    const { user, dialog } = await openAdd();
    await user.type(within(dialog).getByLabelText('Label'), 'x'.repeat(41));
    await user.type(within(dialog).getByLabelText('Shirt number'), '12');
    await user.click(within(dialog).getByRole('button', { name: 'Add player' }));
    expect(within(dialog).getByText('Use between 1 and 40 characters.')).toBeInTheDocument();
    expect(insertPlayer).not.toHaveBeenCalled();
  });

  it.each(['0', '100', 'ten'])('refuses the shirt number %s', async (shirt) => {
    const { user, dialog } = await openAdd();
    await user.type(within(dialog).getByLabelText('Label'), 'Ris');
    await user.type(within(dialog).getByLabelText('Shirt number'), shirt);
    await user.click(within(dialog).getByRole('button', { name: 'Add player' }));
    expect(within(dialog).getByText('Enter a whole number from 1 to 99.')).toBeInTheDocument();
    expect(insertPlayer).not.toHaveBeenCalled();
  });

  it('refuses a shirt number another active player wears, naming them', async () => {
    const { user, dialog } = await openAdd();
    await user.type(within(dialog).getByLabelText('Label'), 'Ris');
    await user.type(within(dialog).getByLabelText('Shirt number'), '7');
    await user.click(within(dialog).getByRole('button', { name: 'Add player' }));
    expect(within(dialog).getByText('Shirt 7 is already worn by Soko.')).toBeInTheDocument();
    expect(insertPlayer).not.toHaveBeenCalled();
  });

  it('stores a player with no consent recorded and no date of it', async () => {
    vi.mocked(insertPlayer).mockResolvedValue();
    const { user, dialog } = await openAdd();
    await user.type(within(dialog).getByLabelText('Label'), '  Ris ');
    await user.type(within(dialog).getByLabelText('Shirt number'), '12');
    await user.click(within(dialog).getByRole('button', { name: 'Add player' }));
    await waitFor(() => {
      expect(insertPlayer).toHaveBeenCalledWith({
        club_id: 'club-1',
        team_id: 'team-1',
        label: 'Ris',
        shirt_number: 12,
        consent: 'not_recorded',
        consent_recorded_at: null,
        birth_quarter: null,
      });
    });
    expect(await screen.findByText('Player added: Ris.')).toBeInTheDocument();
  });

  it('dates the consent when it is granted, and stores the birth quarter', async () => {
    vi.mocked(insertPlayer).mockResolvedValue();
    const { user, dialog } = await openAdd();
    await user.type(within(dialog).getByLabelText('Label'), 'Ris');
    await user.type(within(dialog).getByLabelText('Shirt number'), '12');
    await user.selectOptions(within(dialog).getByLabelText('Guardian consent'), 'Granted');
    await user.selectOptions(
      within(dialog).getByLabelText('Birth quarter (optional)'),
      'Q2 (Apr–Jun)',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Add player' }));
    await waitFor(() => {
      expect(insertPlayer).toHaveBeenCalledWith(
        expect.objectContaining({
          consent: 'granted',
          consent_recorded_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/) as string,
          birth_quarter: 2,
        }),
      );
    });
  });

  it('turns the database unique error into a message at the shirt field', async () => {
    vi.mocked(insertPlayer).mockRejectedValue({ code: '23505' });
    const { user, dialog } = await openAdd();
    await user.type(within(dialog).getByLabelText('Label'), 'Ris');
    await user.type(within(dialog).getByLabelText('Shirt number'), '12');
    await user.click(within(dialog).getByRole('button', { name: 'Add player' }));
    expect(
      await within(dialog).findByText('That shirt number was just taken. Pick another.'),
    ).toBeInTheDocument();
  });

  it('shows any other failure as a toast and keeps the form', async () => {
    vi.mocked(insertPlayer).mockRejectedValue({ code: '54000' });
    const { user, dialog } = await openAdd();
    await user.type(within(dialog).getByLabelText('Label'), 'Ris');
    await user.type(within(dialog).getByLabelText('Shirt number'), '12');
    await user.click(within(dialog).getByRole('button', { name: 'Add player' }));
    expect(await screen.findByText(/Too many attempts/)).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Label')).toHaveValue('Ris');
  });

  it('starts fresh each time the sheet opens', async () => {
    const { user, dialog } = await openAdd();
    await user.type(within(dialog).getByLabelText('Label'), 'Half typed');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'Add a player' }));
    expect(within(screen.getByRole('dialog')).getByLabelText('Label')).toHaveValue('');
  });
});

describe('editing a player', () => {
  async function openEdit(name: string) {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('button', { name }));
    return { user, dialog: screen.getByRole('dialog', { name: 'Edit player' }) };
  }

  it('starts from the player and may keep their own shirt number', async () => {
    vi.mocked(updatePlayer).mockResolvedValue();
    const { user, dialog } = await openEdit('Edit Soko');
    expect(within(dialog).getByLabelText('Label')).toHaveValue('Soko');
    expect(within(dialog).getByLabelText('Shirt number')).toHaveValue('7');
    await user.clear(within(dialog).getByLabelText('Label'));
    await user.type(within(dialog).getByLabelText('Label'), 'Sokol');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      // Consent did not change, so the date it was recorded is left alone.
      expect(updatePlayer).toHaveBeenCalledWith('club-1', 'p-1', {
        label: 'Sokol',
        shirt_number: 7,
        birth_quarter: 1,
      });
    });
    expect(await screen.findByText('Saved: Sokol.')).toBeInTheDocument();
  });

  it('records a new date when consent changes', async () => {
    vi.mocked(updatePlayer).mockResolvedValue();
    const { user, dialog } = await openEdit('Edit Soko');
    await user.selectOptions(within(dialog).getByLabelText('Guardian consent'), 'Withdrawn');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(updatePlayer).toHaveBeenCalledWith(
        'club-1',
        'p-1',
        expect.objectContaining({
          consent: 'withdrawn',
          consent_recorded_at: expect.any(String) as string,
        }),
      );
    });
  });

  it('clears the date when consent goes back to not recorded', async () => {
    vi.mocked(updatePlayer).mockResolvedValue();
    const { user, dialog } = await openEdit('Edit Soko');
    await user.selectOptions(within(dialog).getByLabelText('Guardian consent'), 'Not recorded');
    await user.selectOptions(
      within(dialog).getByLabelText('Birth quarter (optional)'),
      'Not given',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(updatePlayer).toHaveBeenCalledWith('club-1', 'p-1', {
        label: 'Soko',
        shirt_number: 7,
        birth_quarter: null,
        consent: 'not_recorded',
        consent_recorded_at: null,
      });
    });
  });

  it("refuses somebody else's shirt number", async () => {
    const { user, dialog } = await openEdit('Edit Soko');
    await user.clear(within(dialog).getByLabelText('Shirt number'));
    await user.type(within(dialog).getByLabelText('Shirt number'), '9');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(within(dialog).getByText('Shirt 9 is already worn by Vuk.')).toBeInTheDocument();
    expect(updatePlayer).not.toHaveBeenCalled();
  });
});
