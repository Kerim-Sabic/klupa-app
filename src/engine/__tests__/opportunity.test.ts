import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildOpportunityReport, gini, shrunkRate, type PlayerExposure } from '../opportunity';
import { EngineError } from '../types';

const squad: PlayerExposure[] = [
  { playerId: 'p1', minutes: 80, attempts: 20, successes: 16 },
  { playerId: 'p2', minutes: 70, attempts: 18, successes: 9 },
  { playerId: 'p3', minutes: 10, attempts: 2, successes: 2 },
  { playerId: 'p4', minutes: 0, attempts: 0, successes: 0 },
];

describe('shrunkRate', () => {
  it('pulls small samples towards the group rate', () => {
    // 2 from 2 looks like 100%; with 10 pseudo-attempts at 50% it is 58%.
    expect(shrunkRate(2, 2, 0.5, 10)).toBeCloseTo(7 / 12, 12);
    // 16 from 20 keeps most of its signal.
    expect(shrunkRate(16, 20, 0.5, 10)).toBeCloseTo(21 / 30, 12);
  });

  it('always lands between the raw rate and the prior', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 200 }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0.1, max: 100, noNaN: true }),
        (attempts, successShare, prior, strength) => {
          const successes = Math.round(attempts * successShare);
          const raw = successes / attempts;
          const shrunk = shrunkRate(successes, attempts, prior, strength);
          expect(shrunk).toBeGreaterThanOrEqual(Math.min(raw, prior) - 1e-12);
          expect(shrunk).toBeLessThanOrEqual(Math.max(raw, prior) + 1e-12);
        },
      ),
    );
  });

  it('rejects an impossible prior', () => {
    expect(() => shrunkRate(1, 2, 1.5, 10)).toThrow(EngineError);
    expect(() => shrunkRate(1, 2, 0.5, 0)).toThrow(EngineError);
  });
});

describe('gini', () => {
  it('is 0 when everyone gets the same and for empty input', () => {
    expect(gini([30, 30, 30, 30])).toBeCloseTo(0, 12);
    expect(gini([])).toBe(0);
    expect(gini([0, 0])).toBe(0);
  });

  it('rises as minutes concentrate on fewer players', () => {
    expect(gini([90, 90, 0, 0])).toBeCloseTo(0.5, 12);
    expect(gini([180, 0, 0, 0])).toBeCloseTo(0.75, 12);
  });

  it('stays within [0, 1)', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 5000 }), { maxLength: 30 }), (values) => {
        const value = gini(values);
        expect(value).toBeGreaterThanOrEqual(-1e-12);
        expect(value).toBeLessThan(1);
      }),
    );
  });
});

describe('buildOpportunityReport', () => {
  const report = buildOpportunityReport(squad);

  it('does not let a tiny sample outrank a well-observed player', () => {
    const byId = new Map(report.rows.map((row) => [row.playerId, row]));
    expect(byId.get('p3')?.rawRate).toBe(1);
    expect(byId.get('p3')?.shrunkRate).toBeLessThan(byId.get('p1')?.shrunkRate ?? 0);
  });

  it('reports the unobserved as unknown, not as zero', () => {
    const benched = report.rows.find((row) => row.playerId === 'p4');
    expect(benched?.rawRate).toBeNull();
    expect(benched?.shrunkRate).toBeCloseTo(report.groupRate, 12);
    expect(benched?.underObserved).toBe(true);
  });

  it('queues the least-observed players first for a second look', () => {
    expect(report.secondLook).toEqual(['p4', 'p3']);
  });

  it('measures how unevenly minutes were shared', () => {
    expect(report.minutesGini).toBeGreaterThan(0.4);
    const p4 = report.rows.find((row) => row.playerId === 'p4');
    expect(p4?.minutesDebt).toBe(40);
    expect(report.rows.reduce((sum, row) => sum + row.minutesShare, 0)).toBeCloseTo(1, 12);
  });

  it('handles an empty squad and a squad with no observations', () => {
    expect(buildOpportunityReport([])).toMatchObject({ rows: [], groupRate: 0, secondLook: [] });
    const idle = buildOpportunityReport([{ playerId: 'a', minutes: 0, attempts: 0, successes: 0 }]);
    expect(idle.rows[0]?.minutesShare).toBe(0);
    expect(idle.groupRate).toBe(0);
  });

  it('rejects impossible records', () => {
    const bad = (row: Partial<PlayerExposure>): (() => unknown) => {
      return () =>
        buildOpportunityReport([{ playerId: 'x', minutes: 1, attempts: 1, successes: 0, ...row }]);
    };
    expect(bad({ successes: 2 })).toThrow(EngineError);
    expect(bad({ attempts: -1 })).toThrow(EngineError);
    expect(bad({ minutes: -5 })).toThrow(EngineError);
    expect(bad({ attempts: 1.5 })).toThrow(EngineError);
  });
});
