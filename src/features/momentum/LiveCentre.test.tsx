import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import i18n from '../../i18n';
import type { FeedState } from './api';
import { LiveCentre } from './LiveCentre';
import type { ReviewEvent } from './reviewModel';

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
  ev({ kind: 'corner', weight: 250, clock_seconds: 200 }),
  ev({ kind: 'goal', weight: 3200, clock_seconds: 400, x: 90, y: 48 }),
  ev({ side: 'away', kind: 'goal', weight: 2500, clock_seconds: 700, x: 88, y: 60 }),
  ev({ side: 'away', kind: 'shot_off_target', weight: 600, clock_seconds: 900, x: 80, y: 30 }),
  ev({ side: 'away', kind: 'shot_on_target', weight: 900, clock_seconds: 1000 }),
  ev({ side: 'away', kind: 'goal', weight: 2000, period: 2, clock_seconds: 300, x: 92, y: 50 }),
];

const NAMES = { home: 'Our U13', away: 'FK Sloga' };

function renderCentre(events: readonly ReviewEvent[], feed: FeedState | null = 'live') {
  render(<LiveCentre events={events} sideNames={NAMES} periodCount={2} feed={feed} />);
  return within(screen.getByRole('region', { name: /Live match centre|Utakmica uživo/ }));
}

beforeEach(async () => {
  await i18n.changeLanguage('en');
});

describe('LiveCentre', () => {
  it('shows the score and the moment it is true for', () => {
    const centre = renderCentre(EVENTS);
    expect(centre.getByText('Live')).toBeInTheDocument();
    expect(centre.getByText('Half 2 · newest event 5:00')).toBeInTheDocument();
    expect(centre.getByText('Score: Our U13 1, FK Sloga 2')).toBeInTheDocument();
  });

  it('counts what has happened so far for both sides', () => {
    const centre = renderCentre(EVENTS);
    const numbers = within(centre.getByRole('table', { name: 'So far' }));
    const row = (name: string) =>
      within(numbers.getByRole('row', { name: new RegExp(name) }))
        .getAllByRole('cell')
        .map((cell) => cell.textContent);
    expect(row('Shots')).toEqual(['1', '4']);
    expect(row('On target')).toEqual(['1', '3']);
    expect(row('Chance quality')).toEqual(['0.32', '0.60']);
    expect(row('Corners')).toEqual(['1', '0']);
    expect(row('Into the box')).toEqual(['0', '0']);
  });

  it('says who is on top as of the newest event, and lists the latest events', () => {
    const centre = renderCentre(EVENTS);
    const now = within(centre.getByRole('region', { name: 'As of the newest event' }));
    expect(now.getByText('FK Sloga on top')).toBeInTheDocument();
    const items = within(centre.getByRole('region', { name: 'Latest' })).getAllByRole('listitem');
    expect(items).toHaveLength(4);
    expect(items[0]).toHaveTextContent('5:00');
    expect(items[0]).toHaveTextContent('Goal · FK Sloga');
  });

  it('names the state of the feed, and stays quiet about it when the match is not followed', () => {
    const { unmount } = render(
      <LiveCentre events={EVENTS} sideNames={NAMES} periodCount={2} feed="offline" />,
    );
    expect(screen.getByText('Updates paused')).toBeInTheDocument();
    unmount();
    renderCentre(EVENTS, null);
    expect(screen.getByText('In progress')).toBeInTheDocument();
  });

  it('counts periods rather than halves when a match has more than two', () => {
    render(<LiveCentre events={EVENTS} sideNames={NAMES} periodCount={3} feed="live" />);
    expect(screen.getByText('Period 2 · newest event 5:00')).toBeInTheDocument();
  });

  it('makes no claim before the first event, in Bosnian too', async () => {
    await i18n.changeLanguage('bs');
    const centre = renderCentre([], 'connecting');
    expect(centre.getByText('Prerano za zaključak')).toBeInTheDocument();
    expect(centre.getByText('Još ništa nije zabilježeno')).toBeInTheDocument();
    expect(centre.getByText('Povezujem se')).toBeInTheDocument();
    expect(centre.getByText('Rezultat: Our U13 0, FK Sloga 0')).toBeInTheDocument();
  });
});
