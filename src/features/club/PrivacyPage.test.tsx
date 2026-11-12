import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import { useActiveClub, useClub } from '../../lib/club';
import {
  createDataRequest,
  deleteClub,
  exportClubData,
  listDataRequests,
  resolveDataRequest,
} from './privacy/api';
import { downloadJson } from './download';
import { PrivacyPage } from './PrivacyPage';
import { CLUB, renderScreen } from './test-utils';

vi.mock('./privacy/api');
vi.mock('./download');
vi.mock('../../lib/club', () => ({ useActiveClub: vi.fn(), useClub: vi.fn() }));

const refresh = vi.fn();
const EXPORT = { exported_at: '2026-11-12T10:00:00Z', players: [] };

function setup(role: typeof CLUB.role = 'owner') {
  vi.mocked(useActiveClub).mockReturnValue({ ...CLUB, role });
  vi.mocked(useClub).mockReturnValue({ state: { status: 'ready', club: CLUB }, refresh });
  return renderScreen(<PrivacyPage />, '/club/privacy');
}

beforeEach(async () => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 12, 10, 0, 0));
  refresh.mockResolvedValue(undefined);
  vi.mocked(listDataRequests).mockResolvedValue([]);
  await i18n.changeLanguage('en');
});

afterEach(() => {
  vi.useRealTimers();
});

describe('what Klupa says about data', () => {
  it('lists what is stored, where, and for how long, in plain words', async () => {
    setup();
    expect(screen.getByRole('heading', { level: 1, name: 'Privacy and data' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'What Klupa stores' })).toBeInTheDocument();
    expect(screen.getByText(/a label you choose and a shirt number/)).toBeInTheDocument();
    expect(screen.getByText(/the quarter of the year a player was born in/)).toBeInTheDocument();
    expect(
      screen.getByText(
        'Klupa does not store names, birth dates, photos, contact details or health records.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/hosted in the European Union, in Frankfurt/)).toBeInTheDocument();
    expect(screen.getByText(/only members of this club read or change/)).toBeInTheDocument();
    expect(screen.getByText(/deleted for good after 30 days/)).toBeInTheDocument();
    expect(screen.getByText(/activity log is deleted after one year/)).toBeInTheDocument();
    expect(screen.getByText(/Demo clubs are deleted after one week/)).toBeInTheDocument();
    await screen.findByText('No requests yet.');
  });

  it('is available in Bosnian', async () => {
    await i18n.changeLanguage('bs');
    setup();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Privatnost i podaci' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/ne čuva imena, datume rođenja/)).toBeInTheDocument();
    await screen.findByText('Još nema zahtjeva.');
  });

  it.each(['coach', 'assistant', 'viewer'] as const)(
    'offers a %s no export or deletion, and says why',
    (role) => {
      setup(role);
      expect(screen.getByText(/Only the club's owner can download or delete/)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Download export' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Delete this club' })).not.toBeInTheDocument();
      expect(listDataRequests).not.toHaveBeenCalled();
    },
  );
});

describe('exporting the club data', () => {
  it('records the request, completes it, then hands over the file', async () => {
    vi.mocked(exportClubData).mockResolvedValue(EXPORT);
    vi.mocked(createDataRequest).mockResolvedValue('req-1');
    vi.mocked(resolveDataRequest).mockResolvedValue();
    setup();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Download export' }));
    await waitFor(() => {
      expect(downloadJson).toHaveBeenCalledWith('klupa-export-2026-11-12.json', EXPORT);
    });
    expect(exportClubData).toHaveBeenCalledWith('club-1');
    expect(createDataRequest).toHaveBeenCalledWith('club-1', 'export');
    expect(resolveDataRequest).toHaveBeenCalledWith(
      'club-1',
      'req-1',
      'completed',
      new Date(2026, 10, 12, 10, 0, 0).toISOString(),
    );
    const order = [
      vi.mocked(exportClubData).mock.invocationCallOrder[0],
      vi.mocked(createDataRequest).mock.invocationCallOrder[0],
      vi.mocked(resolveDataRequest).mock.invocationCallOrder[0],
      vi.mocked(downloadJson).mock.invocationCallOrder[0],
    ];
    expect(order).toEqual([...order].sort((a, b) => (a ?? 0) - (b ?? 0)));
    expect(
      await screen.findByText('Export downloaded: klupa-export-2026-11-12.json'),
    ).toBeInTheDocument();
  });

  it('records nothing and downloads nothing when the export fails', async () => {
    vi.mocked(exportClubData).mockRejectedValue({ code: '42501' });
    setup();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Download export' }));
    expect(await screen.findByText('You do not have permission to do that.')).toBeInTheDocument();
    expect(createDataRequest).not.toHaveBeenCalled();
    expect(downloadJson).not.toHaveBeenCalled();
  });

  it('does not hand over the file if the request could not be recorded', async () => {
    vi.mocked(exportClubData).mockResolvedValue(EXPORT);
    vi.mocked(createDataRequest).mockRejectedValue(new TypeError('offline'));
    setup();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Download export' }));
    expect(await screen.findByText(/No connection/)).toBeInTheDocument();
    expect(downloadJson).not.toHaveBeenCalled();
  });
});

describe('past data requests', () => {
  it('lists them with kind, date and status', async () => {
    vi.mocked(listDataRequests).mockResolvedValue([
      {
        id: 'r1',
        kind: 'export',
        status: 'completed',
        created_at: '2026-11-10T08:30:00Z',
        resolved_at: '2026-11-10T08:30:01Z',
      },
      {
        id: 'r2',
        kind: 'erasure',
        status: 'open',
        created_at: '2026-11-11T09:00:00Z',
        resolved_at: null,
      },
    ]);
    setup();
    const table = await screen.findByRole('table', { name: 'Data requests' });
    const rows = within(table).getAllByRole('row').slice(1);
    // Newest first.
    expect(rows[0]).toHaveTextContent('Erasure');
    expect(rows[0]).toHaveTextContent('Open');
    expect(rows[1]).toHaveTextContent('Export');
    expect(rows[1]).toHaveTextContent('Completed');
    expect(rows[1]).toHaveTextContent(/2026/);
  });

  it('shows a loading status, then an error with a retry', async () => {
    vi.mocked(listDataRequests).mockRejectedValueOnce(new TypeError('offline'));
    setup();
    expect(screen.getByRole('status')).toHaveTextContent('Loading');
    expect(await screen.findByRole('alert')).toHaveTextContent('This could not be loaded.');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('No requests yet.')).toBeInTheDocument();
  });
});

describe('deleting the club', () => {
  async function openSheet() {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('button', { name: 'Delete this club' }));
    return { user, dialog: screen.getByRole('dialog', { name: 'Delete FK Sunce?' }) };
  }

  it('says what will be lost and asks for the club name', async () => {
    const { dialog } = await openSheet();
    expect(dialog).toHaveTextContent('This cannot be undone.');
    expect(within(dialog).getByLabelText('Type the club name to confirm')).toHaveValue('');
    expect(within(dialog).getByText('Type FK Sunce exactly as it is written.')).toBeInTheDocument();
  });

  it('refuses a name that does not match, including a different case', async () => {
    const { user, dialog } = await openSheet();
    await user.type(within(dialog).getByLabelText('Type the club name to confirm'), 'fk sunce');
    await user.click(within(dialog).getByRole('button', { name: 'Delete club permanently' }));
    expect(within(dialog).getByText('That does not match the club name.')).toBeInTheDocument();
    expect(deleteClub).not.toHaveBeenCalled();
  });

  it('deletes the club, reloads who the coach is and leaves for the welcome page', async () => {
    vi.mocked(deleteClub).mockResolvedValue();
    const { user, dialog } = await openSheet();
    await user.type(within(dialog).getByLabelText('Type the club name to confirm'), 'FK Sunce');
    await user.click(within(dialog).getByRole('button', { name: 'Delete club permanently' }));
    await waitFor(() => {
      expect(deleteClub).toHaveBeenCalledWith('club-1');
    });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Welcome page')).toBeInTheDocument();
  });

  it('shows a failure as a toast and stays on the page', async () => {
    vi.mocked(deleteClub).mockRejectedValue({ code: '42501' });
    const { user, dialog } = await openSheet();
    await user.type(within(dialog).getByLabelText('Type the club name to confirm'), 'FK Sunce');
    await user.click(within(dialog).getByRole('button', { name: 'Delete club permanently' }));
    expect(await screen.findByText('You do not have permission to do that.')).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.queryByText('Welcome page')).not.toBeInTheDocument();
  });

  it('can be cancelled', async () => {
    const { user, dialog } = await openSheet();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(deleteClub).not.toHaveBeenCalled();
  });
});
