import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import { SessionPage } from './SessionPage';
import { DETAIL, db, drillOf, resetDb, withStatus } from './session-fixtures';
import { CLUB, SESSION_ID, dbError, makePlayers, queryResult, renderAt } from './test-utils';

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

beforeEach(async () => {
  await i18n.changeLanguage('en');
  Object.values(api).forEach((fn) => {
    fn.mockReset();
  });
  resetDb(api);
  mocks.players.mockReturnValue(queryResult({ data: makePlayers(3) }));
});

describe('loading and failing', () => {
  it('shows a loading status first', () => {
    api.fetchSession.mockReturnValue(new Promise(() => undefined));
    renderSession();
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });

  it('says the session is not there when the id is not an id, without asking the database', () => {
    renderSession('not-an-id');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Session not found' }),
    ).toBeInTheDocument();
    expect(api.fetchSession).not.toHaveBeenCalled();
  });

  it('says the session is not there when this club has none with that id', async () => {
    db.detail = null;
    renderSession();
    expect(
      await screen.findByText('It may have been removed, or the link is wrong.'),
    ).toBeInTheDocument();
    expect(api.fetchSession).toHaveBeenCalledWith('club-1', SESSION_ID);
    expect(screen.getByRole('link', { name: 'Back to training' })).toHaveAttribute(
      'href',
      '/training',
    );
  });

  it('offers a retry when the session fails to load', async () => {
    api.fetchSession.mockRejectedValueOnce(dbError());
    renderSession();
    expect(await screen.findByRole('alert')).toHaveTextContent('This could not be loaded.');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Pressing' })).toBeInTheDocument();
  });

  it('offers a retry when attendance fails to load, and the card stays', async () => {
    api.fetchAttendance.mockRejectedValueOnce(dbError());
    renderSession();
    expect(await screen.findByRole('alert')).toHaveTextContent('This could not be loaded.');
    expect(screen.getByRole('article')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('radiogroup', { name: 'Player 1' })).toBeInTheDocument();
  });
});

describe('the session card', () => {
  it('shows the saved drills in order with minutes, set-up and coaching points', async () => {
    renderSession();
    expect(await screen.findByRole('heading', { level: 1, name: 'Pressing' })).toBeInTheDocument();
    const card = within(screen.getByRole('article', { name: 'Pressing' }));
    expect(card.getByText('Planned')).toBeInTheDocument();
    expect(
      card.getByText(/Thu, 12 Nov 2026 · 60 min · half pitch · 12 players/),
    ).toBeInTheDocument();
    const headings = card.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(headings).toEqual([
      `1. ${drillOf('rondo-warmup').name.en}`,
      `2. ${drillOf('pressure-box').name.en}`,
      `3. ${drillOf('end-zone-game').name.en}`,
    ]);
    expect(card.getByText('0–10 min')).toBeInTheDocument();
    expect(card.getByText('10–40 min')).toBeInTheDocument();
    expect(card.getByText('40–60 min')).toBeInTheDocument();
    expect(card.getByText(drillOf('pressure-box').setup.en)).toBeInTheDocument();
    expect(card.getByText(drillOf('pressure-box').coachingPoints[0]?.en ?? '')).toBeInTheDocument();
    expect(card.getByText('Bring:').parentElement).toHaveTextContent(/Balls/);
  });

  it('says so when a drill is no longer in the library', async () => {
    db.detail = {
      ...DETAIL,
      drills: [{ id: 'x', position: 1, drill_key: 'retired-drill', minutes: 60 }],
    };
    renderSession();
    expect(await screen.findByText(/no longer in the library/)).toBeInTheDocument();
  });

  it('prints the page', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    renderSession();
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Print' }));
    expect(print).toHaveBeenCalledOnce();
    print.mockRestore();
  });

  it('ships print rules that hide the navigation and force black on white', async () => {
    const { container } = renderSession();
    await screen.findByRole('article');
    const css = container.querySelector('style')?.textContent ?? '';
    expect(css).toContain('@media print');
    expect(css).toContain('nav');
    expect(css).toContain('#000');
  });
});

describe('completing and cancelling', () => {
  it('marks a planned session completed', async () => {
    renderSession();
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Mark completed' }));
    await waitFor(() => {
      expect(api.updateSessionStatus).toHaveBeenCalledWith('club-1', SESSION_ID, 'completed');
    });
    expect(await screen.findByText('Session marked as completed.')).toBeInTheDocument();
  });

  it('asks before cancelling, and keeps the session when you change your mind', async () => {
    renderSession();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Mark cancelled' }));
    const sheet = await screen.findByRole('dialog', { name: 'Cancel this session?' });
    await user.click(within(sheet).getByRole('button', { name: 'Keep it' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.updateSessionStatus).not.toHaveBeenCalled();
  });

  it('cancels after confirmation', async () => {
    renderSession();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Mark cancelled' }));
    const sheet = await screen.findByRole('dialog', { name: 'Cancel this session?' });
    await user.click(within(sheet).getByRole('button', { name: 'Cancel session' }));
    await waitFor(() => {
      expect(api.updateSessionStatus).toHaveBeenCalledWith('club-1', SESSION_ID, 'cancelled');
    });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('shows a problem and leaves the status alone when the update fails', async () => {
    api.updateSessionStatus.mockRejectedValue(dbError('42501'));
    renderSession();
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Mark completed' }));
    expect(await screen.findByText('You do not have permission to do that.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark completed' })).toBeEnabled();
  });

  it('offers neither action once the session is completed', async () => {
    db.detail = withStatus('completed');
    renderSession();
    expect(
      await screen.findByRole('heading', { name: 'Attendance and observations' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark completed' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark cancelled' })).not.toBeInTheDocument();
    expect(within(screen.getByRole('article')).getByText('Completed')).toBeInTheDocument();
  });

  it('does not record attendance for a cancelled session', async () => {
    db.detail = withStatus('cancelled');
    renderSession();
    expect(await screen.findByText(/This session was cancelled/)).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    expect(api.fetchAttendance).not.toHaveBeenCalled();
  });
});

describe('Bosnian', () => {
  it('shows the card and the row controls in Bosnian', async () => {
    await i18n.changeLanguage('bs');
    renderSession();
    expect(await screen.findByRole('heading', { level: 1, name: 'Presing' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Odštampaj' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 3, name: new RegExp(drillOf('pressure-box').name.bs) }),
    ).toBeInTheDocument();
    const player = await screen.findByRole('radiogroup', { name: 'Player 1' });
    await userEvent.setup().click(within(player).getByRole('radio', { name: 'Prisutan' }));
    expect(await screen.findByText('10 · maksimalno')).toBeInTheDocument();
    expect(screen.getByText('Koliko je bilo teško? Pitajte igrača.')).toBeInTheDocument();
  });
});
