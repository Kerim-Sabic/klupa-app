import { describe, expect, it } from 'vitest';
import { focusLink, focusNeed, matchStrip, pickMatches } from './matchModel';
import { event, match } from './testData';

describe('pickMatches', () => {
  it('finds the live match and the newest finished one, whatever order they arrive in', () => {
    const older = match('a', '2026-10-01');
    const newer = match('b', '2026-11-01');
    const live = match('c', '2026-11-10', 'live');
    const planned = match('d', '2026-11-20', 'scheduled');
    expect(pickMatches([older, planned, newer, live])).toEqual({ live, last: newer });
    expect(pickMatches([planned])).toEqual({ live: null, last: null });
  });
});

describe('matchStrip', () => {
  it('covers every period end to end, marks where the second begins and counts goals', () => {
    const strip = matchStrip(match('m', '2026-11-01'), [
      event('home', 'goal', 10),
      event('home', 'shot_on_target', 20),
      event('away', 'goal', 30, 2),
    ]);
    expect(strip.total).toBe(120);
    expect(strip.breaks).toEqual([60]);
    expect(strip.score).toEqual({ home: 1, away: 1 });
    expect(strip.segments[0]?.from).toBe(0);
    expect(strip.segments[strip.segments.length - 1]?.to).toBe(120);
    strip.segments.slice(1).forEach((segment, index) => {
      expect(segment.from).toBe(strip.segments[index]?.to);
      expect(segment.to).toBeGreaterThan(segment.from);
    });
    const shares = strip.shares.reduce((sum, entry) => sum + entry.share, 0);
    expect(shares).toBeCloseTo(1, 10);
    expect(strip.shares.map((entry) => entry.share)).toEqual(
      [...strip.shares.map((entry) => entry.share)].sort((a, b) => b - a),
    );
  });

  it('never cuts off stoppage time, and reads an untagged match as not enough evidence', () => {
    const long = matchStrip(match('m', '2026-11-01'), [event('home', 'corner', 95)]);
    expect(long.total).toBe(95 + 60);
    const empty = matchStrip(match('m', '2026-11-01'), []);
    expect(empty.shares).toEqual([{ state: 'insufficient', share: 1 }]);
    expect(empty.score).toEqual({ home: 0, away: 0 });
  });
});

describe('focusNeed', () => {
  it('needs enough tags before suggesting anything', () => {
    expect(focusNeed('m', [event('home', 'lost_ball_own_half', 5)])).toBeNull();
  });

  it('returns the strongest suggestion with the count behind it', () => {
    const events = [
      ...Array.from({ length: 7 }, (_, index) => event('home', 'lost_ball_own_half', index * 5)),
      ...Array.from({ length: 5 }, (_, index) => event('away', 'corner', 40 + index)),
    ];
    const need = focusNeed('match 1', events);
    expect(need).toEqual({
      kind: 'focus',
      focus: 'build_up',
      reason: { code: 'lostOwnHalf', values: { lost: 7 } },
      matchId: 'match 1',
    });
    expect(need === null ? '' : focusLink(need)).toBe(
      '/training/new?focus=build_up&match=match%201',
    );
  });

  it('says nothing when the counts are ordinary', () => {
    const events = Array.from({ length: 12 }, (_, index) => event('home', 'corner', index));
    expect(focusNeed('m', events)).toBeNull();
  });
});
