import { describe, expect, it } from 'vitest';
import { xgUnits } from '../../engine';
import {
  DEFAULT_SHOT_UNITS,
  EVENT_KINDS,
  eventWeight,
  evidenceSide,
  isShotKind,
  otherSide,
  TERRITORY_UNITS,
  toEvidence,
  toEvidenceList,
  type EvidenceRow,
} from './weights';

const row = (overrides: Partial<EvidenceRow> = {}): EvidenceRow => ({
  id: 'e1',
  period: 2,
  clock_seconds: 754,
  side: 'home',
  kind: 'corner',
  weight: 250,
  ...overrides,
});

describe('eventWeight', () => {
  it('uses the engine xG for a located shot, header and free kick included', () => {
    const location = { x: 90, y: 50 };
    expect(eventWeight({ kind: 'goal', location })).toBe(
      xgUnits({ x: 90, y: 50, header: false, freeKick: false }),
    );
    expect(eventWeight({ kind: 'shot_on_target', location, header: true })).toBe(
      xgUnits({ x: 90, y: 50, header: true, freeKick: false }),
    );
    expect(
      eventWeight({ kind: 'shot_off_target', location: { x: 75, y: 40 }, freeKick: true }),
    ).toBe(xgUnits({ x: 75, y: 40, header: false, freeKick: true }));
  });

  it('gives a close shot more weight than a long one', () => {
    const close = eventWeight({ kind: 'goal', location: { x: 95, y: 50 } });
    const far = eventWeight({ kind: 'goal', location: { x: 65, y: 50 } });
    expect(close).toBeGreaterThan(far);
  });

  it('falls back to the default for a shot without a location', () => {
    expect(eventWeight({ kind: 'goal' })).toBe(DEFAULT_SHOT_UNITS);
    expect(eventWeight({ kind: 'shot_off_target', location: null })).toBe(700);
  });

  it('uses the conventional values for territory events, ignoring any location', () => {
    expect(eventWeight({ kind: 'big_chance' })).toBe(3500);
    expect(eventWeight({ kind: 'box_entry', location: { x: 90, y: 50 } })).toBe(300);
    expect(eventWeight({ kind: 'corner' })).toBe(250);
    expect(eventWeight({ kind: 'high_recovery' })).toBe(150);
    expect(eventWeight({ kind: 'lost_ball_own_half' })).toBe(150);
    expect(Object.keys(TERRITORY_UNITS)).toHaveLength(5);
  });

  it('stays inside the database weight range for every kind', () => {
    for (const kind of EVENT_KINDS) {
      const weight = eventWeight({ kind, location: { x: 100, y: 50 } });
      expect(Number.isInteger(weight)).toBe(true);
      expect(weight).toBeGreaterThanOrEqual(0);
      expect(weight).toBeLessThanOrEqual(10_000);
    }
  });
});

describe('kinds and sides', () => {
  it('knows which kinds are shots', () => {
    expect(EVENT_KINDS.filter(isShotKind)).toEqual(['goal', 'shot_on_target', 'shot_off_target']);
  });

  it('flips only a ball lost in the own half', () => {
    expect(otherSide('home')).toBe('away');
    expect(otherSide('away')).toBe('home');
    expect(evidenceSide('lost_ball_own_half', 'home')).toBe('away');
    expect(evidenceSide('lost_ball_own_half', 'away')).toBe('home');
    for (const kind of EVENT_KINDS.filter((k) => k !== 'lost_ball_own_half')) {
      expect(evidenceSide(kind, 'home')).toBe('home');
    }
  });
});

describe('toEvidence', () => {
  it('maps a stored row to engine evidence', () => {
    expect(toEvidence(row())).toEqual({ id: 'e1', period: 2, t: 754, side: 'home', weight: 250 });
  });

  it('credits the opponent when we lose the ball in our own half', () => {
    expect(toEvidence(row({ kind: 'lost_ball_own_half', side: 'home' })).side).toBe('away');
  });

  it('keeps the stored weight, which already includes the free-kick flag', () => {
    expect(toEvidence(row({ kind: 'goal', weight: 1234 })).weight).toBe(1234);
  });

  it('leaves undone events out of the list', () => {
    const list = toEvidenceList([
      { ...row({ id: 'a' }), deleted_at: null },
      { ...row({ id: 'b' }), deleted_at: '2026-11-11T10:00:00Z' },
    ]);
    expect(list.map((event) => event.id)).toEqual(['a']);
  });
});
