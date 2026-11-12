import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import { useActiveClub } from '../../lib/club';
import { ActivityPage } from './ActivityPage';
import { listAuditLog, type AuditEntry } from './privacy/api';
import { formatDateTime } from './model';
import { CLUB, renderScreen } from './test-utils';

vi.mock('./privacy/api');
vi.mock('../../lib/club', () => ({ useActiveClub: vi.fn(), useClub: vi.fn() }));

const ROWS: AuditEntry[] = [
  {
    id: 3,
    action: 'update',
    table_name: 'players',
    changed_columns: ['consent', 'consent_recorded_at'],
    occurred_at: '2026-11-11T09:15:00Z',
  },
  {
    id: 2,
    action: 'insert',
    table_name: 'match_events',
    changed_columns: null,
    occurred_at: '2026-11-10T18:00:00Z',
  },
  {
    id: 1,
    action: 'delete',
    table_name: 'future_table',
    changed_columns: ['some_new_column'],
    occurred_at: '2026-11-09T07:00:00Z',
  },
];

function setup(role: typeof CLUB.role = 'owner') {
  vi.mocked(useActiveClub).mockReturnValue({ ...CLUB, role });
  return renderScreen(<ActivityPage />, '/club/activity');
}

beforeEach(async () => {
  vi.resetAllMocks();
  vi.mocked(listAuditLog).mockResolvedValue(ROWS);
  await i18n.changeLanguage('en');
});

describe('ActivityPage', () => {
  it('shows a loading status first', () => {
    vi.mocked(listAuditLog).mockReturnValue(new Promise(() => undefined));
    setup();
    expect(screen.getByRole('status')).toHaveTextContent('Loading');
  });

  it('explains a failure and retries', async () => {
    vi.mocked(listAuditLog).mockRejectedValueOnce({ code: '42501' });
    setup();
    expect(await screen.findByRole('alert')).toHaveTextContent('This could not be loaded.');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(listAuditLog).toHaveBeenCalledTimes(2);
  });

  it('says so when nothing has been logged', async () => {
    vi.mocked(listAuditLog).mockResolvedValue([]);
    setup();
    expect(await screen.findByText('Nothing logged yet')).toBeInTheDocument();
  });

  it('lists when, what, where and which fields, newest first', async () => {
    setup('coach');
    const table = await screen.findByRole('table', { name: 'Changes, newest first' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent(formatDateTime('2026-11-11T09:15:00Z', 'en'));
    expect(rows[0]).toHaveTextContent('Changed');
    expect(rows[0]).toHaveTextContent('Player');
    expect(rows[0]).toHaveTextContent('consent, consent date');
    expect(rows[1]).toHaveTextContent('Added');
    expect(rows[1]).toHaveTextContent('Match event');
    expect(rows[1]).toHaveTextContent('Whole record');
    expect(listAuditLog).toHaveBeenCalledWith('club-1');
  });

  it('never leaves a raw database name on screen for something it has no word for yet', async () => {
    setup();
    const table = await screen.findByRole('table');
    expect(within(table).getByText('future table')).toBeInTheDocument();
    expect(within(table).getByText('some new column')).toBeInTheDocument();
    expect(within(table).queryByText('future_table')).not.toBeInTheDocument();
  });

  it('explains that the log holds field names and never values', async () => {
    setup();
    expect(
      await screen.findByText(
        'The log records which fields changed and never their values, so it holds no personal data.',
      ),
    ).toBeInTheDocument();
  });

  it('speaks Bosnian, dates included', async () => {
    await i18n.changeLanguage('bs');
    setup();
    const table = await screen.findByRole('table', { name: 'Promjene, najnovije prvo' });
    expect(table).toHaveTextContent('Promijenjeno');
    expect(table).toHaveTextContent('Igrač');
    expect(table).toHaveTextContent('saglasnost, datum saglasnosti');
    expect(table).toHaveTextContent(formatDateTime('2026-11-11T09:15:00Z', 'bs'));
  });

  it.each(['assistant', 'viewer'] as const)('is closed to a %s, who is told why', (role) => {
    setup(role);
    expect(
      screen.getByText("Only the club's owner and coaches can see the activity log."),
    ).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(listAuditLog).not.toHaveBeenCalled();
  });
});
