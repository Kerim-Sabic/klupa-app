import { describe, expect, it } from 'vitest';
import { scoreOf, type ScoringEvent } from './score';

const goal = (side: 'home' | 'away', deleted: boolean = false): ScoringEvent => ({
  kind: 'goal',
  side,
  deleted_at: deleted ? '2026-11-11T10:00:00Z' : null,
});

describe('scoreOf', () => {
  it('is nil-nil with no events', () => {
    expect(scoreOf([])).toEqual({ home: 0, away: 0 });
  });

  it('counts goals per side', () => {
    expect(scoreOf([goal('home'), goal('away'), goal('home')])).toEqual({ home: 2, away: 1 });
  });

  it('ignores undone goals and everything that is not a goal', () => {
    const events: ScoringEvent[] = [
      goal('home', true),
      goal('away'),
      { kind: 'shot_on_target', side: 'home', deleted_at: null },
      { kind: 'big_chance', side: 'away', deleted_at: null },
    ];
    expect(scoreOf(events)).toEqual({ home: 0, away: 1 });
  });
});
