import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionGlobalConfig } from 'motion/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import { ToastProvider } from '../../ui';
import { fetchReviewEvents, fetchReviewMatch, watchMatch } from './api';
import { MatchReviewPage } from './MatchReviewPage';
import type { ReviewEvent, ReviewMatch } from './reviewModel';

vi.mock('./api', () => ({
  fetchReviewMatch: vi.fn(),
  fetchReviewEvents: vi.fn(),
  watchMatch: vi.fn(() => () => undefined),
}));
vi.mock('../../lib/club', () => ({
  useActiveClub: () => ({
    clubId: 'club-1',
    clubName: 'Demo club',
    isDemo: true,
    role: 'coach',
    teamId: 'team-1',
    teamName: 'Our U13',
    ageGroup: 'u13',
  }),
}));
vi.mock('../../lib/data', () => ({
  queryKeys: {
    match: (id: string) => ['match', id],
    matchEvents: (id: string) => ['match-events', id],
  },
}));

MotionGlobalConfig.skipAnimations = true;
const matchMock = vi.mocked(fetchReviewMatch);
const eventsMock = vi.mocked(fetchReviewEvents);

const MATCH: ReviewMatch = {
  id: 'm1',
  opponent: 'FK Sloga',
  played_on: '2026-11-08',
  status: 'finished',
  period_count: 2,
  period_minutes: 30,
};

let serial = 0;
function ev(overrides: Partial<ReviewEvent>): ReviewEvent {
  serial += 1;
  return {
    id: `e${String(serial)}`,
    period: 1,
    clock_seconds: 60,
    side: 'home',
    kind: 'box_entry',
    weight: 300,
    x: null,
    y: null,
    ...overrides,
  };
}

const EVENTS: ReviewEvent[] = [
  ...Array.from({ length: 7 }, (_, index) =>
    ev({ kind: 'lost_ball_own_half', weight: 150, clock_seconds: 120 + index * 60 }),
  ),
  ev({ kind: 'goal', weight: 3200, clock_seconds: 400, x: 90, y: 48 }),
  ev({ side: 'away', kind: 'goal', weight: 2500, clock_seconds: 700, x: 88, y: 60 }),
  ev({ side: 'away', kind: 'shot_off_target', weight: 600, clock_seconds: 900, x: 80, y: 30 }),
  ev({ side: 'away', kind: 'shot_on_target', weight: 900, clock_seconds: 1000 }),
  ev({ side: 'away', kind: 'goal', weight: 2000, period: 2, clock_seconds: 300, x: 92, y: 50 }),
];

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter initialEntries={['/matches/m1']}>
          <Routes>
            <Route path="/matches/:matchId" element={<MatchReviewPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

beforeEach(async () => {
  await i18n.changeLanguage('en');
  matchMock.mockReset();
  vi.mocked(watchMatch).mockReset();
  vi.mocked(watchMatch).mockReturnValue(() => undefined);
  eventsMock.mockReset();
  matchMock.mockResolvedValue(MATCH);
  eventsMock.mockResolvedValue(EVENTS);
});

describe('MatchReviewPage states', () => {
  it('shows a loading state while the match loads', () => {
    matchMock.mockReturnValue(new Promise(() => undefined));
    renderPage();
    expect(screen.getByRole('status')).toHaveTextContent('Loading the match');
    expect(matchMock).toHaveBeenCalledWith('club-1', 'm1');
    expect(eventsMock).toHaveBeenCalledWith('club-1', 'm1');
  });

  it('shows an error with a retry that loads the match', async () => {
    const user = userEvent.setup();
    matchMock.mockRejectedValueOnce({ code: '42501' });
    renderPage();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The match could not be loaded.');
    expect(alert).toHaveTextContent('You do not have permission to do that.');
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Against FK Sloga' }),
    ).toBeVisible();
  });

  it('says when the match does not exist', async () => {
    matchMock.mockResolvedValue(null);
    renderPage();
    expect(await screen.findByText('This match was not found')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'All matches' })[0]).toHaveAttribute(
      'href',
      '/matches',
    );
  });

  it('says when no events were recorded, and offers the tagger for a live match', async () => {
    matchMock.mockResolvedValue({ ...MATCH, status: 'live' });
    eventsMock.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText('No events were recorded in this match')).toBeInTheDocument();
    const taggers = screen.getAllByRole('link', { name: 'Open the tagger' });
    expect(taggers).toHaveLength(2);
    taggers.forEach((link) => {
      expect(link).toHaveAttribute('href', '/matches/m1/live');
    });
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});

describe('MatchReviewPage review', () => {
  it('shows the header, the score and the actions for a finished match', async () => {
    renderPage();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Against FK Sloga' }),
    ).toBeVisible();
    expect(screen.getByText(/Finished/)).toBeInTheDocument();
    expect(screen.getByText('Score: Our U13 1, FK Sloga 2')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Open the tagger' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Plan training from this match' })).toHaveAttribute(
      'href',
      '/training/new?match=m1',
    );
  });

  it('reads who was on top, and scrubbing the chart changes the reading', async () => {
    renderPage();
    const chart = await screen.findByRole('img', { name: /Chance balance.*Our U13.*FK Sloga/ });
    chart.getBoundingClientRect = () => DOMRect.fromRect({ x: 0, y: 0, width: 640, height: 244 });
    fireEvent.pointerDown(chart, { clientX: 0, pointerId: 1 });
    expect(screen.getByRole('heading', { name: 'At 0:00' })).toBeInTheDocument();
    expect(screen.getByText('No chances recorded.')).toBeInTheDocument();
    // 7:00 of 30:00 is 7/30 of the drawable width (14 px padding on each side).
    fireEvent.pointerMove(chart, { clientX: 14 + (612 * 7) / 30, pointerId: 1 });
    expect(screen.getByRole('heading', { name: 'At 7:00' })).toBeInTheDocument();
    expect(
      screen.getAllByText(/^\d:\d\d · Our U13 · Ball lost in own half · 0\.0\d$/).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText('6:40 · Our U13 · Goal · 0.32')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'This half at a glance' })).toBeInTheDocument();
  });

  it('switches the period', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('radio', { name: 'Half 2' }));
    expect(screen.getByRole('img', { name: /Chance balance/ })).toHaveAccessibleName(/of half 2/);
  });

  it('maps where the chances came from with totals labelled as an estimate', async () => {
    renderPage();
    const map = await screen.findByRole('img', { name: /Shot map/ });
    expect(map).toHaveAccessibleName(/Shots by Our U13: 1,.*Shots by FK Sloga: 3,/);
    expect(map.querySelectorAll('[data-goal="true"]')).toHaveLength(3);
    expect(
      screen.getByText('Not drawn: 1 without a tapped location, 0 from the own half.'),
    ).toBeVisible();
    expect(screen.getByText('Shots 1 · goals 1 · chance quality 0.32')).toBeInTheDocument();
    expect(screen.getByText('Shots 4 · goals 2 · chance quality 0.60')).toBeInTheDocument();
    expect(screen.getByText(/pro-calibrated estimate/)).toBeInTheDocument();
  });

  it('suggests what to work on from the counts, shows them and names a limit', async () => {
    renderPage();
    expect(await screen.findByText(/A prompt from the counts, not a diagnosis/)).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Build-up play' })).toBeInTheDocument();
    expect(screen.getByText('Ball lost in our own half: 7')).toBeInTheDocument();
    expect(screen.getByText(/risky passes/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Plan a session: Build-up play' })).toHaveAttribute(
      'href',
      '/training/new?focus=build_up&match=m1',
    );
  });

  it('says when there are too few tags to suggest anything, in Bosnian too', async () => {
    await i18n.changeLanguage('bs');
    eventsMock.mockResolvedValue(EVENTS.slice(7));
    renderPage();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Protiv: FK Sloga' }),
    ).toBeVisible();
    expect(screen.getByText(/Još nema dovoljno zabilježenih događaja/)).toHaveTextContent(
      'zabilježeno 5, potrebno najmanje 12',
    );
  });
});

describe('a match that is still being recorded', () => {
  it('follows it and opens on the live match centre', async () => {
    matchMock.mockResolvedValue({ ...MATCH, status: 'live' });
    vi.mocked(watchMatch).mockImplementation((_matchId, _onChange, onState) => {
      onState('live');
      return () => undefined;
    });
    renderPage();
    const centre = within(await screen.findByRole('region', { name: 'Live match centre' }));
    expect(centre.getByText('Live')).toBeInTheDocument();
    expect(centre.getByText('Half 2 · newest event 5:00')).toBeInTheDocument();
    expect(centre.getByText('Score: Our U13 1, FK Sloga 2')).toBeInTheDocument();
    expect(watchMatch).toHaveBeenCalledWith('m1', expect.any(Function), expect.any(Function));
    // The centre carries the state of the feed, so the separate banner is not repeated.
    expect(screen.queryByText(/This page updates by itself/)).not.toBeInTheDocument();
  });
  it('reads the events again when another phone records one', async () => {
    matchMock.mockResolvedValue({ ...MATCH, status: 'live' });
    let change: () => void = () => undefined;
    vi.mocked(watchMatch).mockImplementation((_matchId, onChange) => {
      change = onChange;
      return () => undefined;
    });
    renderPage();
    await screen.findByText('Connecting');
    const before = eventsMock.mock.calls.length;
    change();
    await vi.waitFor(() => {
      expect(eventsMock.mock.calls.length).toBeGreaterThan(before);
    });
  });

  it('says so when live updates are cut off, in Bosnian too', async () => {
    await i18n.changeLanguage('bs');
    matchMock.mockResolvedValue({ ...MATCH, status: 'scheduled' });
    vi.mocked(watchMatch).mockImplementation((_matchId, _onChange, onState) => {
      onState('offline');
      return () => undefined;
    });
    renderPage();
    expect(await screen.findByText(/Praćenje uživo je pauzirano/)).toBeInTheDocument();
  });

  it('does not follow a finished match', async () => {
    renderPage();
    await screen.findByRole('heading', { level: 1 });
    expect(watchMatch).not.toHaveBeenCalled();
    expect(screen.queryByText(/This page updates by itself/)).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Live match centre' })).not.toBeInTheDocument();
  });
});

describe('how the chances came about', () => {
  it('shows each side its lead-ups and names the opponent pattern', async () => {
    const lost = (clock: number) =>
      ev({ kind: 'lost_ball_own_half', weight: 150, clock_seconds: clock });
    eventsMock.mockResolvedValue([
      lost(100),
      ev({ side: 'away', kind: 'goal', weight: 3000, clock_seconds: 110 }),
      lost(300),
      ev({ side: 'away', kind: 'shot_on_target', weight: 900, clock_seconds: 320 }),
      lost(500),
      ev({ side: 'away', kind: 'shot_off_target', weight: 500, clock_seconds: 505 }),
      ev({ side: 'away', kind: 'shot_on_target', weight: 700, clock_seconds: 900 }),
      ev({ kind: 'goal', weight: 2500, clock_seconds: 1200 }),
    ]);
    renderPage();
    const heading = await screen.findByRole('heading', {
      level: 2,
      name: 'How the chances came about',
    });
    const section = within(heading.closest('section') ?? document.body);
    const theirs = within(section.getByRole('table', { name: 'FK Sloga · chances: 4' }));
    const turnover = theirs.getByRole('row', {
      name: /After the other side lost the ball in its own half/,
    });
    // Three of their four chances came within 30 seconds of a ball lost in our own half.
    const [chances, goals, quality] = within(turnover).getAllByRole('cell');
    expect(chances).toHaveTextContent('3');
    expect(goals).toHaveTextContent('1');
    expect(quality).toHaveTextContent('0.44');
    expect(
      section.getByText(
        'Most common lead-up: After the other side lost the ball in its own half (3 of 4 chances).',
      ),
    ).toBeInTheDocument();
    expect(section.getByRole('table', { name: /· chances: 1$/ })).toBeInTheDocument();
    expect(section.getByText('No single lead-up stands out.')).toBeInTheDocument();
  });
});
