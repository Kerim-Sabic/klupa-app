import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import { SessionsPage } from './SessionsPage';
import { SESSION_ID, queryResult, renderAt } from './test-utils';

const mocks = vi.hoisted(() => ({ sessions: vi.fn() }));

vi.mock('../../lib/data', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/data')>()),
  useSessionPages: () => mocks.sessions() as unknown,
}));

const session = (overrides: Record<string, unknown> = {}) => ({
  id: SESSION_ID,
  held_on: '2026-11-12',
  status: 'planned',
  focus: 'finishing',
  duration_minutes: 60,
  area: 'half',
  expected_players: 12,
  floodlit: false,
  source_match_id: null,
  ...overrides,
});

function renderList() {
  return renderAt('/training', [
    { path: '/training', element: <SessionsPage /> },
    { path: '/training/new', element: <p>planner</p> },
    { path: '/training/:sessionId', element: <p>session page</p> },
  ]);
}

beforeEach(async () => {
  await i18n.changeLanguage('en');
});

describe('SessionsPage', () => {
  it('shows a loading status while sessions load', () => {
    mocks.sessions.mockReturnValue(queryResult('pending'));
    renderList();
    expect(screen.getByRole('heading', { level: 1, name: 'Training' })).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });

  it('offers a retry when loading fails', async () => {
    const refetch = vi.fn();
    mocks.sessions.mockReturnValue(queryResult('error', refetch));
    renderList();
    expect(screen.getByRole('alert')).toHaveTextContent('This could not be loaded.');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it('says there are no sessions and offers the one next step', async () => {
    mocks.sessions.mockReturnValue(queryResult({ data: [] }));
    renderList();
    expect(screen.getByText('No sessions yet')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('link', { name: 'Plan a session' }));
    expect(screen.getByText('planner')).toBeInTheDocument();
  });

  it('lists each session with its date, focus, length and status', () => {
    mocks.sessions.mockReturnValue(
      queryResult({
        data: [
          session(),
          session({
            id: '33333333-3333-4333-8333-333333333333',
            held_on: '2026-11-05',
            focus: 'pressing',
            duration_minutes: 90,
            status: 'completed',
          }),
        ],
      }),
    );
    renderList();
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    const first = within(items[0] as HTMLElement);
    expect(first.getByRole('heading', { name: 'Finishing' })).toBeInTheDocument();
    expect(first.getByText(/Thu, 12 Nov 2026/)).toHaveTextContent('60 min');
    expect(first.getByText('Planned')).toBeInTheDocument();
    expect(within(items[1] as HTMLElement).getByText('Completed')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Plan a session' })).toHaveAttribute(
      'href',
      '/training/new',
    );
  });

  it('opens a session from its row', async () => {
    mocks.sessions.mockReturnValue(queryResult({ data: [session()] }));
    renderList();
    const link = screen.getByRole('link', { name: 'Finishing' });
    expect(link).toHaveAttribute('href', `/training/${SESSION_ID}`);
    await userEvent.setup().click(link);
    expect(screen.getByText('session page')).toBeInTheDocument();
  });

  it('speaks Bosnian when asked to', async () => {
    await i18n.changeLanguage('bs');
    mocks.sessions.mockReturnValue(queryResult({ data: [session({ status: 'cancelled' })] }));
    renderList();
    expect(screen.getByRole('heading', { name: 'Završnica' })).toBeInTheDocument();
    expect(screen.getByText('Otkazan')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Planiraj trening' })).toBeInTheDocument();
  });
});

describe('earlier sessions', () => {
  it('offers them only when the database has more, and loads them on request', async () => {
    const loadMore = vi.fn();
    mocks.sessions.mockReturnValue({
      isPending: false,
      isError: false,
      isSuccess: true,
      data: [session()],
      hasMore: true,
      loadingMore: false,
      loadMore,
    });
    renderList();
    const button = await screen.findByRole('button', { name: 'Show earlier sessions' });
    button.click();
    expect(loadMore).toHaveBeenCalledTimes(1);
  });

  it('hides the button on the last page', async () => {
    mocks.sessions.mockReturnValue({
      isPending: false,
      isError: false,
      isSuccess: true,
      data: [session()],
      hasMore: false,
    });
    renderList();
    await screen.findAllByRole('listitem');
    expect(screen.queryByRole('button', { name: 'Show earlier sessions' })).not.toBeInTheDocument();
  });
});
