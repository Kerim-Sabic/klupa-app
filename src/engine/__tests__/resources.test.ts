import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { summariseResources, type PitchSession, type ResourceSettings } from '../resources';
import { EngineError } from '../types';

const none: ResourceSettings = { floodlightKw: null, tariffPerKwh: null, gridKgCo2PerKwh: null };
const full: ResourceSettings = { floodlightKw: 10, tariffPerKwh: 0.5, gridKgCo2PerKwh: 0.25 };

function session(over: Partial<PitchSession> = {}): PitchSession {
  return {
    id: 's',
    date: '2026-11-03',
    durationMinutes: 60,
    area: 'full',
    attended: 20,
    floodlit: false,
    ...over,
  };
}

const sessions: PitchSession[] = [
  session({ id: 's1', durationMinutes: 60, area: 'full', attended: 20, floodlit: true }),
  session({ id: 's2', durationMinutes: 90, area: 'half', attended: 8, floodlit: false }),
  session({ id: 's3', durationMinutes: 60, area: 'full', attended: 11, floodlit: true }),
];

describe('summariseResources arithmetic', () => {
  const summary = summariseResources(sessions, full);

  it('weights pitch hours by area', () => {
    expect(summary.pitchHours).toBeCloseTo(1 + 0.75 + 1, 12);
  });

  it('adds player hours and players per pitch hour', () => {
    expect(summary.playerHours).toBeCloseTo(20 + 12 + 11, 12);
    expect(summary.playersPerPitchHour).toBeCloseTo(43 / 2.75, 12);
  });

  it('estimates floodlight energy on the whole pitch, unweighted by area', () => {
    expect(summary.floodlitHours).toBe(2);
    expect(summary.estimatedKwh).toBeCloseTo(20, 12);
    expect(summary.estimatedCost).toBeCloseTo(10, 12);
    expect(summary.estimatedKgCo2).toBeCloseTo(5, 12);
  });

  it('charges a floodlit quarter-pitch session for every lamp', () => {
    const quarter = summariseResources([session({ area: 'quarter', floodlit: true })], full);
    expect(quarter.pitchHours).toBe(0.25);
    expect(quarter.estimatedKwh).toBeCloseTo(10, 12);
  });

  it('always flags itself as an estimate', () => {
    expect(summary.isEstimate).toBe(true);
    expect(summariseResources([], none).isEstimate).toBe(true);
  });
});

describe('summariseResources missing factors', () => {
  it('gives null energy, cost and emissions when nothing is set', () => {
    const summary = summariseResources(sessions, none);
    expect(summary.estimatedKwh).toBeNull();
    expect(summary.estimatedCost).toBeNull();
    expect(summary.estimatedKgCo2).toBeNull();
    expect(summary.floodlitHours).toBe(2);
  });

  it('computes only what the supplied factors allow', () => {
    const power = summariseResources(sessions, { ...none, floodlightKw: 10 });
    expect(power.estimatedKwh).toBeCloseTo(20, 12);
    expect(power.estimatedCost).toBeNull();
    expect(power.estimatedKgCo2).toBeNull();
    const noPower = summariseResources(sessions, { ...none, tariffPerKwh: 0.5 });
    expect(noPower.estimatedKwh).toBeNull();
    expect(noPower.estimatedCost).toBeNull();
  });

  it('treats a zero factor as supplied, not missing', () => {
    expect(summariseResources(sessions, { ...full, tariffPerKwh: 0 }).estimatedCost).toBe(0);
  });
});

describe('right-sizing', () => {
  it('a full pitch with 11 players fits a half; with 12 it does not', () => {
    const eleven = summariseResources([session({ attended: 11 })], none).rightSizing;
    expect(eleven.sessions).toEqual([
      expect.objectContaining({ booked: 'full', wouldFit: 'half', pitchHoursFreed: 0.5 }),
    ]);
    expect(eleven.pitchHoursFreed).toBeCloseTo(0.5, 12);
    expect(summariseResources([session({ attended: 12 })], none).rightSizing.sessions).toEqual([]);
  });

  it('names the smallest area that would have fitted', () => {
    const [flag] = summariseResources([session({ attended: 5, durationMinutes: 120 })], none)
      .rightSizing.sessions;
    expect(flag).toMatchObject({ wouldFit: 'quarter', attended: 5 });
    expect(flag?.pitchHoursFreed).toBeCloseTo(1.5, 12);
    expect(
      summariseResources([session({ area: 'half', attended: 6 })], none).rightSizing.sessions,
    ).toEqual([]);
  });

  it('never flags a quarter pitch and records the session id and date', () => {
    expect(
      summariseResources([session({ area: 'quarter', attended: 0 })], none).rightSizing.sessions,
    ).toEqual([]);
    const [flag] = summariseResources([session({ id: 'x9', attended: 3 })], none).rightSizing
      .sessions;
    expect(flag).toMatchObject({ sessionId: 'x9', date: '2026-11-03' });
  });

  it('follows the club comfortable capacity', () => {
    const tight = { ...none, comfortablePlayersFullPitch: 16 };
    expect(summariseResources([session({ attended: 8 })], tight).rightSizing.sessions).toHaveLength(
      1,
    );
    expect(summariseResources([session({ attended: 9 })], tight).rightSizing.sessions).toHaveLength(
      0,
    );
  });
});

describe('summariseResources edge cases', () => {
  it('handles empty input', () => {
    expect(summariseResources([], full)).toEqual({
      pitchHours: 0,
      playerHours: 0,
      playersPerPitchHour: null,
      floodlitHours: 0,
      estimatedKwh: 0,
      estimatedCost: 0,
      estimatedKgCo2: 0,
      isEstimate: true,
      rightSizing: { sessions: [], pitchHoursFreed: 0 },
    });
  });

  it('rejects impossible sessions and settings', () => {
    const bad = (over: Partial<PitchSession>): (() => unknown) => {
      return () => summariseResources([session(over)], none);
    };
    expect(bad({ id: '' })).toThrow(EngineError);
    expect(bad({ date: '2026-02-30' })).toThrow(EngineError);
    expect(bad({ durationMinutes: -1 })).toThrow(EngineError);
    expect(bad({ durationMinutes: Number.NaN })).toThrow(EngineError);
    expect(bad({ attended: -1 })).toThrow(EngineError);
    expect(bad({ attended: 2.5 })).toThrow(EngineError);
    expect(bad({ area: 'third' as unknown as PitchSession['area'] })).toThrow(EngineError);
    expect(() => summariseResources([], { ...none, floodlightKw: -1 })).toThrow(EngineError);
    expect(() => summariseResources([], { ...none, tariffPerKwh: Number.NaN })).toThrow(
      EngineError,
    );
    expect(() => summariseResources([], { ...none, gridKgCo2PerKwh: -0.1 })).toThrow(EngineError);
    expect(() => summariseResources([], { ...none, comfortablePlayersFullPitch: 0 })).toThrow(
      EngineError,
    );
  });
});

const sessionArb = fc.record({
  id: fc.constant('s'),
  date: fc.constant('2026-11-03'),
  durationMinutes: fc.integer({ min: 0, max: 240 }),
  area: fc.constantFrom('quarter' as const, 'half' as const, 'full' as const),
  attended: fc.integer({ min: 0, max: 40 }),
  floodlit: fc.boolean(),
});

describe('resource properties', () => {
  it('never frees more pitch than was booked', () => {
    fc.assert(
      fc.property(fc.array(sessionArb, { maxLength: 30 }), (rows) => {
        const summary = summariseResources(rows, none);
        expect(summary.rightSizing.pitchHoursFreed).toBeLessThanOrEqual(summary.pitchHours + 1e-9);
        expect(summary.rightSizing.pitchHoursFreed).toBeGreaterThanOrEqual(0);
      }),
    );
  });

  it('doubles hours, energy and freed time when every duration doubles', () => {
    fc.assert(
      fc.property(fc.array(sessionArb, { maxLength: 30 }), (rows) => {
        const doubled = rows.map((row) => ({ ...row, durationMinutes: row.durationMinutes * 2 }));
        const one = summariseResources(rows, full);
        const two = summariseResources(doubled, full);
        expect(two.pitchHours).toBeCloseTo(one.pitchHours * 2, 9);
        expect(two.playerHours).toBeCloseTo(one.playerHours * 2, 9);
        expect(two.floodlitHours).toBeCloseTo(one.floodlitHours * 2, 9);
        expect(two.estimatedKwh ?? 0).toBeCloseTo((one.estimatedKwh ?? 0) * 2, 9);
        expect(two.rightSizing.pitchHoursFreed).toBeCloseTo(one.rightSizing.pitchHoursFreed * 2, 9);
      }),
    );
  });
});
