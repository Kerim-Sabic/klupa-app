import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionConfig, MotionGlobalConfig } from 'motion/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import type { ActiveClub } from '../../lib/club';
import { HomePage } from '../HomePage';
import type { ReviewEvent } from './matchModel';
import type { TodayInput } from './model';
import { emptyInput, event, match, observation, player, present, session, stint } from './testData';
import type { Source } from './useToday';

interface SampleLoad {
  mutate: () => void;
  isPending: boolean;
  isError: boolean;
  error: unknown;
}

interface HoistedState {
  sample: SampleLoad;
  club: ActiveClub | null;
  source: Source<TodayInput>;
  events: Source<readonly ReviewEvent[]>;
  eventsFor: (string | null)[];
}

const state = vi.hoisted((): HoistedState => ({
  sample: { mutate: () => undefined, isPending: false, isError: false, error: null },
  club: null,
  source: { status: 'loading' },
  events: { status: 'loading' },
  eventsFor: [],
}));

vi.mock('./useToday', () => ({
  useTodaySource: () => state.source,
  useMatchEvents: (matchId: string | null) => {
    state.eventsFor.push(matchId);
    return state.events;
  },
}));

vi.mock('../../lib/club', () => ({
  useActiveClub: () => {
    if (state.club === null) throw new Error('No club in this test.');
    return state.club;
  },
}));

vi.mock('../../features/club/useSampleSeason', () => ({
  useSampleSeason: () => state.sample,
}));

MotionGlobalConfig.skipAnimations = true;

const baseClub: ActiveClub = {
  clubId: 'club-1',
  clubName: 'FK Primjer',
  isDemo: false,
  role: 'owner',
  teamId: 'team-1',
  teamName: 'U13',
  ageGroup: 'u13',
};

function renderToday() {
  return render(
    <MemoryRouter>
      <MotionConfig reducedMotion="always">
        <HomePage />
      </MotionConfig>
    </MemoryRouter>,
  );
}

/** Renders a ready season and waits for its sections, which load on demand behind a skeleton. */
async function renderReady() {
  const view = renderToday();
  await waitFor(
    () => {
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    },
    { timeout: 5000 },
  );
  return view;
}

const squad = [player('p1', 1), player('p2', 2), player('p3', 3)];

/** A season that has started: matches, training, some observations. */
function season(overrides: Partial<TodayInput> = {}): Source<TodayInput> {
  return {
    status: 'ready',
    data: emptyInput({
      players: squad,
      matches: [match('m1', '2026-11-08'), match('m0', '2026-10-30')],
      sessions: [session('s-2026-11-10', '2026-11-10', 'quarter')],
      stints: [stint('p1', 40), stint('p2', 40), stint('p3', 20)],
      attendance: [present('p1', '2026-11-10', 60, 6), present('p2', '2026-11-10', 60, null)],
      observations: [observation('p1', 8, 4), observation('p2', 3, 1)],
      ...overrides,
    }),
  };
}

beforeEach(async () => {
  state.club = baseClub;
  state.source = { status: 'loading' };
  state.events = { status: 'loading' };
  state.eventsFor = [];
  await i18n.changeLanguage('en');
});

describe('Today', () => {
  it('leads with the title, the team and the two primary actions', () => {
    renderToday();
    expect(screen.getByRole('heading', { level: 1, name: 'Today' })).toBeInTheDocument();
    expect(screen.getByText('U13 · FK Primjer')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Record a match' })).toHaveAttribute(
      'href',
      '/matches',
    );
    expect(screen.getByRole('link', { name: 'Plan training' })).toHaveAttribute(
      'href',
      '/training/new',
    );
  });

  it('shows placeholders while the season loads', () => {
    renderToday();
    expect(screen.getByRole('status')).toHaveTextContent("Loading today's overview");
  });

  it('offers a retry when the season cannot be read', async () => {
    const retry = vi.fn();
    state.source = { status: 'error', retry };
    renderToday();
    await userEvent.click(
      within(screen.getByRole('alert')).getByRole('button', { name: 'Try again' }),
    );
    expect(retry).toHaveBeenCalledOnce();
  });

  it('walks a brand-new club through its first three steps', async () => {
    state.source = { status: 'ready', data: emptyInput() };
    await renderReady();
    expect(screen.getByRole('heading', { level: 2, name: 'Get started' })).toBeInTheDocument();
    expect(screen.getByText('0 of 3 done')).toBeInTheDocument();
    const current = screen
      .getAllByRole('listitem')
      .find((item) => item.getAttribute('aria-current') === 'step');
    expect(current).toHaveTextContent('Add your squad');
    expect(
      within(current ?? document.body).getByRole('link', { name: 'Add your squad' }),
    ).toHaveAttribute('href', '/club/squad');
    expect(
      screen.queryByRole('heading', { name: 'Where the team stands' }),
    ).not.toBeInTheDocument();
  });

  it('loads the sample season into an empty demo club, right there', async () => {
    const mutate = vi.fn();
    state.sample = { mutate, isPending: false, isError: false, error: null };
    state.club = { ...baseClub, isDemo: true };
    state.source = { status: 'ready', data: emptyInput() };
    await renderReady();
    expect(screen.getByRole('heading', { name: 'Your demo club is empty' })).toBeInTheDocument();
    expect(mutate).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Load the sample season' }));
    expect(mutate).toHaveBeenCalledOnce();
  });

  it('draws the three rings with words and numbers, each linking to its explanation', async () => {
    state.source = season();
    await renderReady();
    const figure = screen.getByRole('img', { name: /^Three rings, outermost first\./ });
    expect(figure).toHaveAccessibleName(
      // Minutes 40/40/20: Gini 2/15. One of three seen 5+ times. 60 of 120 minutes rated.
      'Three rings, outermost first. Fair minutes: 87%. Observed: 33%. Effort recorded: 50%',
    );
    expect(screen.getByRole('link', { name: /Fair minutes/ })).toHaveAttribute('href', '/fairness');
    expect(screen.getByRole('link', { name: /Effort recorded/ })).toHaveAttribute(
      'href',
      '/fairness/load',
    );
    expect(screen.getByText('1 of 3 seen 5+ times')).toBeInTheDocument();
  });

  it('says plainly when a ring has nothing to measure yet', async () => {
    state.source = season({ observations: [] });
    await renderReady();
    expect(screen.getByRole('link', { name: /Observed\s*Not yet/ })).toBeInTheDocument();
    expect(screen.getByText('Nothing observed in training yet')).toBeInTheDocument();
  });

  it('lists what needs the coach, with the number behind each card', async () => {
    state.source = season();
    state.events = {
      status: 'ready',
      data: [
        ...Array.from({ length: 8 }, (_, index) => event('home', 'lost_ball_own_half', index * 4)),
        ...Array.from({ length: 4 }, (_, index) => event('away', 'corner', 40 + index)),
      ],
    };
    await renderReady();
    const needs = within(screen.getByRole('region', { name: 'What needs you' }));
    const cards = needs.getAllByRole('listitem');
    expect(cards[0]).toHaveTextContent(
      'Last match: 8 balls lost in your own half. Suggested focus: Build-up play.',
    );
    expect(needs.getByRole('link', { name: 'Plan this session' })).toHaveAttribute(
      'href',
      '/training/new?focus=build_up&match=m1',
    );
    expect(cards[1]).toHaveTextContent('2 players are owed a second look');
    expect(state.eventsFor).toContain('m1');
  });

  it('says so when nothing needs attention', async () => {
    state.source = season({ observations: [] });
    state.events = { status: 'ready', data: [] };
    await renderReady();
    expect(screen.getByText(/Nothing needs you right now/)).toBeInTheDocument();
  });

  it('shows the last match with its score and the momentum strip, linking to the review', async () => {
    state.source = season();
    state.events = {
      status: 'ready',
      data: [event('home', 'goal', 10), event('home', 'goal', 20, 2), event('away', 'goal', 30, 2)],
    };
    await renderReady();
    const card = within(screen.getByRole('article'));
    expect(
      card.getByRole('link', { name: 'Open the review of the match against Opponent m1' }),
    ).toHaveAttribute('href', '/matches/m1');
    expect(card.getByText('Score: us 2, them 1')).toBeInTheDocument();
    expect(
      card.getByRole('img', { name: /^Who was on top, through the match: / }),
    ).toBeInTheDocument();
  });

  it('keeps the card while the events load and offers a retry if they fail', async () => {
    state.source = season();
    const retry = vi.fn();
    state.events = { status: 'error', retry };
    await renderReady();
    expect(screen.getByRole('article')).toHaveTextContent('Against Opponent m1');
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent("The match's events could not be loaded.");
    await userEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it('turns into a prominent live card while a match is being recorded', async () => {
    state.source = season({
      matches: [match('live-1', '2026-11-11', 'live'), match('m1', '2026-11-08')],
    });
    await renderReady();
    expect(screen.getByText('Live now')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open the tagger' })).toHaveAttribute(
      'href',
      '/matches/live-1/live',
    );
    expect(screen.getByRole('link', { name: 'Watch live' })).toHaveAttribute(
      'href',
      '/matches/live-1',
    );
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Happening now' })).toBeInTheDocument();
  });

  it('reads in Bosnian', async () => {
    await i18n.changeLanguage('bs');
    state.source = season();
    await renderReady();
    expect(screen.getByRole('heading', { level: 1, name: 'Danas' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Kako ekipa stoji' })).toBeInTheDocument();
  });
});
