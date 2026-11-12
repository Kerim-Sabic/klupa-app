import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { FINAL_2016, FINAL_2018, loadMatch } from '../../test/proFixtures';
import {
  clampPlayhead,
  eventPlayhead,
  eventsUntil,
  matchClock,
  momentAt,
  playheadOf,
  scoreOfEvents,
} from './live';

const final = loadMatch(FINAL_2018);
const clock = matchClock(final);

describe('matchClock', () => {
  it('lays the halves end to end', () => {
    expect(clock.total).toBe(2905 + 3002);
    expect(matchClock({ periods: [] }).total).toBe(0);
  });

  it('converts between the playhead and the match clock, stoppage included', () => {
    expect(momentAt(clock, 0)).toMatchObject({ period: 1, t: 0, minute: { label: '1' } });
    expect(momentAt(clock, 46 * 60 + 10).minute.label).toBe('45+2');
    expect(momentAt(clock, 2905)).toMatchObject({ period: 2, t: 0, minute: { label: '46' } });
    expect(momentAt(clock, clock.total).minute.label).toBe('90+6');
    expect(momentAt(clock, -50).t).toBe(0);
    expect(playheadOf(clock, 2, 60)).toBe(2965);
    expect(playheadOf(clock, 9, 60)).toBe(60);
    expect(clampPlayhead(clock, Number.NaN)).toBe(0);
    expect(clampPlayhead(clock, 1e9)).toBe(clock.total);
  });

  it('round-trips a playhead through the match clock', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: clock.total - 1 }), (playhead) => {
        const moment = momentAt(clock, playhead);
        expect(playheadOf(clock, moment.period, moment.t)).toBe(playhead);
      }),
    );
  });
});

describe('eventsUntil', () => {
  it('is empty before kick-off and the whole match at the end', () => {
    expect(eventsUntil(final, -1)).toHaveLength(0);
    expect(eventsUntil(final, clock.total)).toBe(final.events);
  });

  it('grows with the playhead and holds exactly the events that have happened', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -10, max: clock.total + 10 }),
        fc.integer({ min: -10, max: clock.total + 10 }),
        (a, b) => {
          const [early, late] = a <= b ? [a, b] : [b, a];
          const before = eventsUntil(final, early, clock);
          const after = eventsUntil(final, late, clock);
          expect(before.length).toBeLessThanOrEqual(after.length);
          for (const event of before)
            expect(eventPlayhead(clock, event)).toBeLessThanOrEqual(early);
          const next = final.events[before.length];
          if (next !== undefined) expect(eventPlayhead(clock, next)).toBeGreaterThan(early);
        },
      ),
    );
  });

  it('scores from the events so far: 0-0 at kick-off, the header score at the end', () => {
    expect(scoreOfEvents(eventsUntil(final, 0))).toEqual([0, 0]);
    expect(scoreOfEvents(eventsUntil(final, clock.total))).toEqual([4, 2]);
    // France led 2-1 at half-time.
    expect(scoreOfEvents(eventsUntil(final, 2904))).toEqual([2, 1]);
    const euro = loadMatch(FINAL_2016);
    expect(scoreOfEvents(euro.events)).toEqual(euro.teams.map((team) => team.score));
  });
});
