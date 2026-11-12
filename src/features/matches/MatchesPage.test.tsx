import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import { useMatchPages } from '../../lib/data';
import * as api from './api';
import { MatchesPage } from './MatchesPage';
import { dbError, makeMatch, makeRow, renderAt } from './testing';

vi.mock('./api');
vi.mock('../../lib/club', async () => {
  const { CLUB } = await import('./testing');
  return { useActiveClub: () => CLUB };
});
vi.mock('../../lib/data', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/data')>()),
  useMatchPages: vi.fn(),
  usePlayers: vi.fn(),
}));

const refetch = vi.fn();

function matchesResult(state: Record<string, unknown>) {
  vi.mocked(useMatchPages).mockReturnValue({
    isPending: false,
    isError: false,
    data: undefined,
    refetch,
    ...state,
  } as unknown as ReturnType<typeof useMatchPages>);
}

function renderPage() {
  return renderAt(<MatchesPage />, { path: '/matches', route: '/matches' });
}

beforeEach(async () => {
  await i18n.changeLanguage('en');
  vi.mocked(api.fetchGoals).mockResolvedValue([]);
  vi.mocked(api.upsertEvent).mockResolvedValue();
});

describe('MatchesPage', () => {
  it('shows a placeholder while loading', () => {
    matchesResult({ isPending: true });
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Matches' })).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Loading matches' })).toBeInTheDocument();
  });

  it('says when loading failed and retries', async () => {
    matchesResult({ isError: true });
    const { user } = renderPage();
    expect(screen.getByText('Your matches could not be loaded.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(refetch).toHaveBeenCalled();
  });

  it('invites the first match when there are none', async () => {
    matchesResult({ data: [] });
    const { user } = renderPage();
    expect(screen.getByText('No matches yet')).toBeInTheDocument();
    const buttons = screen.getAllByRole('button', { name: 'New match' });
    expect(buttons).toHaveLength(2);
    await user.click(buttons[1] ?? buttons[0] ?? document.body);
    expect(screen.getByRole('dialog', { name: 'New match' })).toBeInTheDocument();
  });

  it('lists matches with status, score and the right destination', async () => {
    matchesResult({
      data: [
        makeMatch({ id: 'm-s', opponent: 'Sloga', status: 'scheduled' }),
        makeMatch({ id: 'm-l', opponent: 'Bosna', status: 'live' }),
        makeMatch({ id: 'm-f', opponent: 'Igman', status: 'finished' }),
      ],
    });
    vi.mocked(api.fetchGoals).mockResolvedValue([
      makeRow({ client_id: 'g1', match_id: 'm-l', kind: 'goal', side: 'home' }),
      makeRow({ client_id: 'g2', match_id: 'm-f', kind: 'goal', side: 'away' }),
      makeRow({ client_id: 'g3', match_id: 'm-f', kind: 'goal', side: 'away' }),
    ]);
    renderPage();
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(within(items[0] ?? document.body).getByText('Scheduled')).toBeInTheDocument();
    expect(within(items[1] ?? document.body).getByText('Live')).toBeInTheDocument();
    expect(within(items[2] ?? document.body).getByText('Finished')).toBeInTheDocument();
    expect(await screen.findByText('Score: us 1, them 0')).toBeInTheDocument();
    expect(screen.getByText('Score: us 0, them 2')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Record Sloga' })).toHaveAttribute(
      'href',
      '/matches/m-s/live',
    );
    expect(screen.getByRole('link', { name: 'Record Bosna' })).toHaveAttribute(
      'href',
      '/matches/m-l/live',
    );
    expect(screen.getByRole('link', { name: 'Review Igman' })).toHaveAttribute(
      'href',
      '/matches/m-f',
    );
    expect(api.fetchGoals).toHaveBeenCalledWith('club-1', ['m-l', 'm-f']);
  });
});

describe('New match', () => {
  async function openSheet() {
    matchesResult({ data: [makeMatch()] });
    const view = renderPage();
    await view.user.click(screen.getByRole('button', { name: 'New match' }));
    return { ...view, dialog: screen.getByRole('dialog', { name: 'New match' }) };
  }

  it('fills in today, two periods and the age-group minutes', async () => {
    const { dialog } = await openSheet();
    expect(within(dialog).getByLabelText('Periods')).toHaveValue('2');
    expect(within(dialog).getByLabelText('Minutes per period')).toHaveValue(25);
    expect(within(dialog).getByLabelText('Date')).not.toHaveValue('');
  });

  it('shows each reason next to its field and sends nothing', async () => {
    const { user, dialog } = await openSheet();
    await user.clear(within(dialog).getByLabelText('Minutes per period'));
    await user.type(within(dialog).getByLabelText('Minutes per period'), '70');
    await user.clear(within(dialog).getByLabelText('Date'));
    await user.click(screen.getByRole('button', { name: 'Create match' }));
    expect(screen.getByText("Enter the opponent's name.")).toBeInTheDocument();
    expect(screen.getByText('Enter a whole number from 5 to 60.')).toBeInTheDocument();
    expect(screen.getByText('Choose the match date.')).toBeInTheDocument();
    expect(api.createMatch).not.toHaveBeenCalled();
    await user.type(within(dialog).getByLabelText('Opponent'), 'S');
    expect(screen.queryByText("Enter the opponent's name.")).not.toBeInTheDocument();
  });

  it('rejects a name longer than 60 characters', async () => {
    const { user, dialog } = await openSheet();
    await user.type(within(dialog).getByLabelText('Opponent'), 'x'.repeat(61));
    await user.click(screen.getByRole('button', { name: 'Create match' }));
    expect(screen.getByText('Keep the name to 60 characters or fewer.')).toBeInTheDocument();
  });

  it('creates the match and opens the tagger', async () => {
    vi.mocked(api.createMatch).mockResolvedValue('new-id');
    const { user, dialog } = await openSheet();
    await user.type(within(dialog).getByLabelText('Opponent'), '  Velež ');
    await user.selectOptions(within(dialog).getByLabelText('Periods'), '4');
    await user.click(screen.getByRole('button', { name: 'Create match' }));
    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/matches/new-id/live');
    });
    expect(api.createMatch).toHaveBeenCalledWith(
      expect.objectContaining({
        clubId: 'club-1',
        teamId: 'team-1',
        opponent: 'Velež',
        periodCount: 4,
        periodMinutes: 25,
      }),
    );
    expect(screen.getByText(/Match added/)).toBeInTheDocument();
  });

  it('says why creating failed and keeps the sheet open', async () => {
    vi.mocked(api.createMatch).mockRejectedValue(dbError('42501'));
    const { user, dialog } = await openSheet();
    await user.type(within(dialog).getByLabelText('Opponent'), 'Velež');
    await user.click(screen.getByRole('button', { name: 'Create match' }));
    expect(await screen.findByText('You do not have permission to do that.')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'New match' })).toBeInTheDocument();
  });

  it('cancels and starts fresh next time', async () => {
    const { user, dialog } = await openSheet();
    await user.type(within(dialog).getByLabelText('Opponent'), 'Velež');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'New match' }));
    expect(screen.getByLabelText('Opponent')).toHaveValue('');
  });
});

describe('earlier matches', () => {
  it('offers them only when the database has more, and loads them on request', async () => {
    const loadMore = vi.fn();
    matchesResult({ isSuccess: true, data: [makeMatch({ id: 'm-1' })], hasMore: true, loadMore });
    renderPage();
    const button = await screen.findByRole('button', { name: 'Show earlier matches' });
    button.click();
    expect(loadMore).toHaveBeenCalledTimes(1);
  });

  it('waits while a page is on its way, and hides the button on the last page', async () => {
    matchesResult({
      isSuccess: true,
      data: [makeMatch({ id: 'm-1' })],
      hasMore: true,
      loadingMore: true,
      loadMore: vi.fn(),
    });
    const first = renderPage();
    expect(await screen.findByRole('button', { name: 'Show earlier matches' })).toBeDisabled();
    first.unmount();

    matchesResult({ isSuccess: true, data: [makeMatch({ id: 'm-1' })], hasMore: false });
    renderPage();
    await screen.findAllByRole('listitem');
    expect(screen.queryByRole('button', { name: 'Show earlier matches' })).not.toBeInTheDocument();
  });
});
