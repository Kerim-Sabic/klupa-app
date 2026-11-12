import type { UseQueryResult } from '@tanstack/react-query';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { xgUnits } from '../../engine';
import i18n from '../../i18n';
import { usePlayers, type Player } from '../../lib/data';
import * as api from './api';
import { saveClock } from './clock';
import { rowFromInsert } from './feed';
import type { EventRow } from './model';
import { loadOutbox } from './outbox';
import { VIEW } from './pitch';
import { TaggerPage } from './TaggerPage';
import { dbError, makeMatch, makeRow, renderAt } from './testing';

vi.mock('./api');
vi.mock('../../lib/club', async () => {
  const { CLUB } = await import('./testing');
  return { useActiveClub: () => CLUB };
});
vi.mock('../../lib/data', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/data')>()),
  useMatches: vi.fn(),
  usePlayers: vi.fn(),
}));

function renderTagger() {
  return renderAt(<TaggerPage />, {
    path: '/matches/:matchId/live',
    route: '/matches/match-1/live',
  });
}

/** A clock that kicked off `seconds` ago and is still running. */
function runningFor(seconds: number) {
  saveClock('match-1', {
    period: 1,
    running: true,
    elapsedMs: 0,
    startedAt: Date.now() - seconds * 1000,
    ended: false,
  });
}

function feed() {
  return within(screen.getByRole('region', { name: 'Last events' }));
}

/** A tiny stand-in for the database, so refetches return what was sent. */
let stored: EventRow[] = [];

beforeEach(async () => {
  await i18n.changeLanguage('en');
  stored = [];
  vi.mocked(api.fetchMatch).mockResolvedValue(makeMatch({ status: 'live' }));
  vi.mocked(api.fetchEvents).mockImplementation(() => Promise.resolve([...stored]));
  vi.mocked(api.fetchStints).mockResolvedValue([]);
  vi.mocked(api.upsertEvent).mockImplementation((row) => {
    if (!stored.some((entry) => entry.client_id === row.client_id)) {
      stored.push(rowFromInsert(row, new Date().toISOString()));
    }
    return Promise.resolve();
  });
  vi.mocked(api.undoEvent).mockImplementation((_club, _match, clientId, deletedAt) => {
    stored = stored.map((row) =>
      row.client_id === clientId ? { ...row, deleted_at: deletedAt } : row,
    );
    return Promise.resolve();
  });
  vi.mocked(api.setMatchStatus).mockResolvedValue();
  vi.mocked(usePlayers).mockReturnValue({
    isPending: false,
    isError: false,
    data: [],
  } as unknown as UseQueryResult<Player[]>);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the tagger flow', () => {
  it('records nothing before kick-off and says why', async () => {
    vi.mocked(api.fetchMatch).mockResolvedValue(makeMatch({ status: 'scheduled' }));
    renderTagger();
    const corner = await screen.findByRole('button', { name: 'Corner' });
    expect(corner).toBeDisabled();
    expect(corner).toHaveAccessibleDescription('Start the match to record events.');
    expect(screen.getByText('Before kick-off')).toBeInTheDocument();
  });

  it('starts the match, tags an event, shows it in the feed and the outbox, then undoes it', async () => {
    vi.mocked(api.fetchMatch).mockResolvedValue(makeMatch({ status: 'scheduled' }));
    let release: () => void = () => {
      throw new Error('The upload was never started.');
    };
    vi.mocked(api.upsertEvent).mockImplementation(
      (row) =>
        new Promise<void>((resolve) => {
          release = () => {
            stored.push(rowFromInsert(row, new Date().toISOString()));
            resolve();
          };
        }),
    );
    const vibrate = vi.fn(() => true);
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true });
    const { user } = renderTagger();

    await user.click(await screen.findByRole('button', { name: 'Start match' }));
    await waitFor(() => {
      expect(api.setMatchStatus).toHaveBeenCalledWith('club-1', 'match-1', 'live');
    });
    expect(screen.getByText('Half 1')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Corner' }));
    expect(feed().getByText('Corner')).toBeInTheDocument();
    expect(feed().getByText('Waiting to send')).toBeInTheDocument();
    expect(screen.getByText('Waiting to send: 1')).toBeInTheDocument();
    expect(loadOutbox().pending.map((item) => item.op.kind)).toEqual(['event']);
    expect(vibrate).toHaveBeenCalledWith(10);
    expect(screen.getByText(/Corner recorded for Us at 00:0\d\./)).toBeInTheDocument();
    expect(api.upsertEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        club_id: 'club-1',
        match_id: 'match-1',
        period: 1,
        side: 'home',
        kind: 'corner',
        weight: 250,
        x: null,
        y: null,
      }),
    );

    release();
    expect(await screen.findByText('All saved')).toBeInTheDocument();
    expect(loadOutbox().pending).toEqual([]);

    const sent = vi.mocked(api.upsertEvent).mock.calls[0]?.[0];
    await user.click(screen.getByRole('button', { name: /^Undo Corner at/ }));
    await waitFor(() => {
      expect(api.undoEvent).toHaveBeenCalledWith(
        'club-1',
        'match-1',
        sent?.client_id,
        expect.any(String),
      );
    });
    expect(feed().queryByText('Corner')).not.toBeInTheDocument();
    expect(screen.getByText('Undone.')).toBeInTheDocument();
  });

  it('records the side chosen and the clock at the tap', async () => {
    runningFor(754);
    const { user } = renderTagger();
    await user.click(await screen.findByRole('radio', { name: 'Them' }));
    await user.click(screen.getByRole('button', { name: 'Lost the ball in own half' }));
    const row = vi.mocked(api.upsertEvent).mock.calls[0]?.[0];
    expect(row?.side).toBe('away');
    expect(row?.clock_seconds).toBeGreaterThanOrEqual(754);
    expect(row?.clock_seconds).toBeLessThan(760);
    expect(row?.weight).toBe(150);
  });

  it('places a shot on the pitch and saves its chance quality', async () => {
    runningFor(60);
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: VIEW.width,
      height: VIEW.height,
    } as DOMRect);
    const { user } = renderTagger();
    await user.click(await screen.findByRole('radio', { name: 'Them' }));
    await user.click(screen.getByRole('button', { name: 'Goal' }));
    const sheet = screen.getByRole('dialog', { name: 'Goal: where was it taken from?' });
    expect(within(sheet).getByRole('button', { name: 'Save' })).toBeDisabled();

    // The penalty spot in drawing units, which equal screen pixels with this box.
    fireEvent.click(within(sheet).getByRole('button', { name: /Attacking half/ }), {
      clientX: 340 - VIEW.x,
      clientY: 110 - VIEW.y,
      detail: 1,
    });
    const expected = xgUnits({ x: 90, y: 50, header: false, freeKick: false });
    expect(within(sheet).getByText(/About 11 m from goal/)).toBeInTheDocument();
    expect(
      within(sheet).getByText(`Chance quality ${String(Math.round(expected / 100))}%`),
    ).toBeInTheDocument();
    expect(within(sheet).getByText(/An estimate from a model trained/)).toBeInTheDocument();

    await user.click(within(sheet).getByRole('button', { name: 'Save' }));
    expect(api.upsertEvent).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'goal', side: 'away', x: 90, y: 50, weight: expected }),
    );
    expect(screen.getByText('Us 0, Zvijezda 1')).toBeInTheDocument();
    expect(feed().getByText(/Chance quality/)).toBeInTheDocument();
  });

  it('saves a header from the keyboard, and a shot without a location', async () => {
    runningFor(60);
    const { user } = renderTagger();
    await user.click(await screen.findByRole('button', { name: 'Shot on target' }));
    const pitch = screen.getByRole('button', { name: /Attacking half/ });
    pitch.focus();
    await user.keyboard('{ArrowUp}{ArrowUp}{Shift>}{ArrowRight}{/Shift}');
    await user.click(screen.getByRole('checkbox', { name: 'Header' }));
    await user.click(screen.getByRole('checkbox', { name: 'Direct free kick' }));
    expect(screen.getByRole('checkbox', { name: 'Header' })).not.toBeChecked();
    await user.click(screen.getByRole('checkbox', { name: 'Header' }));
    expect(screen.getByRole('checkbox', { name: 'Direct free kick' })).not.toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(api.upsertEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({
        x: 91,
        y: 55,
        header: true,
        weight: xgUnits({ x: 91, y: 55, header: true, freeKick: false }),
      }),
    );

    await user.click(screen.getByRole('button', { name: 'Shot off target' }));
    await user.click(screen.getByRole('button', { name: 'Save without location' }));
    expect(api.upsertEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: 'shot_off_target', x: null, y: null, weight: 700 }),
    );
    expect(feed().getByText('No location')).toBeInTheDocument();
  });

  it('keeps a tap queued while offline and shows it as waiting', async () => {
    runningFor(30);
    vi.mocked(api.upsertEvent).mockRejectedValue(new TypeError('Failed to fetch'));
    const { user } = renderTagger();
    await user.click(await screen.findByRole('button', { name: 'Big chance' }));
    await waitFor(() => {
      expect(api.upsertEvent).toHaveBeenCalled();
    });
    expect(screen.getByText('Waiting to send: 1')).toBeInTheDocument();
    expect(feed().getByText('Big chance')).toBeInTheDocument();
    expect(loadOutbox().pending).toHaveLength(1);

    vi.mocked(api.upsertEvent).mockResolvedValue();
    window.dispatchEvent(new Event('online'));
    expect(await screen.findByText('All saved')).toBeInTheDocument();
  });

  it('lists an event the server refused, and lets the coach retry or remove it', async () => {
    runningFor(30);
    vi.mocked(api.upsertEvent).mockRejectedValue(dbError('23514'));
    const { user } = renderTagger();
    await user.click(await screen.findByRole('button', { name: 'Into the box' }));
    const list = await screen.findByRole('region', { name: 'Could not be saved' });
    expect(within(list).getByText(/Into the box/)).toBeInTheDocument();
    expect(within(list).getByText(/did not look right/)).toBeInTheDocument();
    expect(feed().getByText('Not saved')).toBeInTheDocument();

    await user.click(within(list).getByRole('button', { name: 'Try again' }));
    await waitFor(() => {
      expect(api.upsertEvent).toHaveBeenCalledTimes(2);
    });
    await user.click(
      within(await screen.findByRole('region', { name: 'Could not be saved' })).getByRole(
        'button',
        { name: 'Remove' },
      ),
    );
    expect(screen.queryByRole('region', { name: 'Could not be saved' })).not.toBeInTheDocument();
    expect(feed().queryByText('Into the box')).not.toBeInTheDocument();
  });

  it('shows the score from stored events and leaves undone goals out', async () => {
    runningFor(30);
    vi.mocked(api.fetchEvents).mockResolvedValue([
      makeRow({ client_id: 'a', kind: 'goal', side: 'home' }),
      makeRow({ client_id: 'b', kind: 'goal', side: 'home', deleted_at: '2026-11-14T10:00Z' }),
      makeRow({ client_id: 'c', kind: 'goal', side: 'away' }),
    ]);
    renderTagger();
    expect(await screen.findByText('Us 1, Zvijezda 1')).toBeInTheDocument();
  });

  it('locks recording once the match is finished and links to the review', async () => {
    vi.mocked(api.fetchMatch).mockResolvedValue(makeMatch({ status: 'finished' }));
    renderTagger();
    expect(await screen.findByText('This match is finished.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open the review' })).toHaveAttribute(
      'href',
      '/matches/match-1',
    );
    expect(screen.getByRole('button', { name: 'Goal' })).toHaveAccessibleDescription(
      'The match is finished. Nothing more can be recorded.',
    );
  });
});
