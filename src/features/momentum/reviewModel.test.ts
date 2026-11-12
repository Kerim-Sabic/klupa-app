import { describe, expect, it } from 'vitest';
import {
  PITCH,
  evidenceOf,
  mapShots,
  reviewPeriods,
  scoreOf,
  shotMarks,
  shotTotals,
  type ReviewEvent,
  type ReviewMatch,
} from './reviewModel';

const match: ReviewMatch = {
  id: 'm1',
  opponent: 'Opponent',
  played_on: '2026-11-08',
  status: 'finished',
  period_count: 2,
  period_minutes: 30,
};

function event(overrides: Partial<ReviewEvent> & Pick<ReviewEvent, 'id'>): ReviewEvent {
  return {
    period: 1,
    clock_seconds: 60,
    side: 'home',
    kind: 'shot_on_target',
    weight: 1000,
    x: null,
    y: null,
    ...overrides,
  };
}

const events: ReviewEvent[] = [
  event({ id: 'g1', kind: 'goal', weight: 3000, x: 90, y: 50 }),
  event({ id: 's1', side: 'away', kind: 'shot_off_target', weight: 500, x: 75, y: 20 }),
  event({ id: 's2', side: 'away', kind: 'shot_on_target', weight: 700 }),
  event({ id: 's3', side: 'home', kind: 'shot_off_target', weight: 200, x: 30, y: 50 }),
  event({ id: 'l1', side: 'home', kind: 'lost_ball_own_half', weight: 150 }),
  event({ id: 'g2', period: 2, clock_seconds: 1900, side: 'away', kind: 'goal', weight: 4000 }),
];

describe('reviewPeriods', () => {
  it('uses the scheduled length unless an event ran later', () => {
    expect(reviewPeriods(match, events)).toEqual([
      { period: 1, durationSeconds: 1800 },
      { period: 2, durationSeconds: 1900 },
    ]);
  });

  it('keeps empty scheduled periods and adds periods that events reached', () => {
    expect(reviewPeriods({ ...match, period_count: 3 }, [])).toHaveLength(3);
    expect(reviewPeriods({ ...match, period_count: 1 }, events).map((p) => p.period)).toEqual([
      1, 2,
    ]);
  });
});

describe('score and totals', () => {
  it('counts goal events per side', () => {
    expect(scoreOf(events)).toEqual({ home: 1, away: 1 });
    expect(scoreOf([])).toEqual({ home: 0, away: 0 });
  });

  it('sums shots, goals and chance quality, ignoring territory tags', () => {
    expect(shotTotals(events)).toEqual({
      home: { shots: 2, goals: 1, chanceQuality: 3200 },
      away: { shots: 3, goals: 1, chanceQuality: 5200 },
    });
  });
});

describe('evidence and marks', () => {
  it('turns rows into engine evidence; a ball lost in our half favours them', () => {
    const evidence = evidenceOf(events);
    expect(evidence).toHaveLength(events.length);
    expect(evidence.find((item) => item.id === 'l1')).toEqual({
      id: 'l1',
      period: 1,
      t: 60,
      side: 'away',
      weight: 150,
    });
  });

  it('marks only the shots of the chosen period, rings goals', () => {
    expect(shotMarks(events, 1).map((mark) => [mark.id, mark.side, mark.goal])).toEqual([
      ['g1', 'home', true],
      ['s1', 'away', false],
      ['s2', 'away', false],
      ['s3', 'home', false],
    ]);
    expect(shotMarks(events, 2)).toEqual([
      { id: 'g2', t: 1900, side: 'away', weight: 4000, goal: true },
    ]);
  });
});

describe('mapShots', () => {
  it('places located shots on one attacking half and counts the rest', () => {
    const { shots, unplaced, ownHalf } = mapShots(events);
    expect(unplaced).toBe(2);
    expect(ownHalf).toBe(1);
    expect(shots.map((shot) => shot.id)).toEqual(['g1', 's1']);
    const [goal, miss] = shots;
    expect(goal?.across).toBeCloseTo(PITCH.width / 2, 10);
    expect(goal?.depth).toBeCloseTo(10.5, 10);
    expect(goal?.goal).toBe(true);
    expect(miss?.across).toBeCloseTo(13.6, 10);
    expect(miss?.depth).toBeCloseTo(26.25, 10);
    expect(miss?.side).toBe('away');
  });
});
