import { describe, expect, it } from 'vitest';
import golden from '../../../research/out/xg_golden.json';
import { EngineError } from '../types';
import {
  DEFAULT_XG_MODEL,
  expectedGoals,
  shotFeatures,
  xgUnits,
  type ShotInput,
  type XgModel,
} from '../xg';

const foot = (x: number, y: number): ShotInput => ({ x, y, header: false, freeKick: false });

describe('golden agreement with the Python model', () => {
  it('has 60 cases', () => {
    expect(golden.cases).toHaveLength(60);
  });

  it('matches probability to 1e-9 and units exactly for every case', () => {
    for (const row of golden.cases) {
      const shot: ShotInput = { x: row.x, y: row.y, header: row.header, freeKick: row.freeKick };
      expect(Math.abs(expectedGoals(shot) - row.probability)).toBeLessThan(1e-9);
      expect(xgUnits(shot)).toBe(row.units);
    }
  });
});

describe('shotFeatures', () => {
  it('measures the penalty spot at about 11 m with a wide angle', () => {
    const f = shotFeatures(foot(89.5, 50));
    expect(f.distance).toBeCloseTo(11.025, 9);
    expect(f.angle).toBeGreaterThan(0.5);
    expect(f.isHeader).toBe(0);
    expect(f.isFreeKick).toBe(0);
  });

  it('sets the flags and keeps the angle within [0, pi]', () => {
    const f = shotFeatures({ x: 100, y: 50, header: true, freeKick: true });
    expect(f.angle).toBeLessThanOrEqual(Math.PI);
    expect(f.angle).toBeGreaterThanOrEqual(0);
    expect(f.isHeader).toBe(1);
    expect(f.isFreeKick).toBe(1);
  });

  it('gives a narrower angle from a tight touchline position', () => {
    expect(shotFeatures(foot(95, 5)).angle).toBeLessThan(shotFeatures(foot(95, 50)).angle);
  });
});

describe('expectedGoals', () => {
  it('stays strictly between 0 and 1 across the pitch', () => {
    for (let x = 0; x <= 100; x += 10) {
      for (let y = 0; y <= 100; y += 10) {
        const p = expectedGoals(foot(x, y));
        expect(p).toBeGreaterThan(0);
        expect(p).toBeLessThan(1);
      }
    }
  });

  it('rises as the shot gets closer along the centre line', () => {
    let previous = 0;
    for (let x = 50; x < 100; x += 0.5) {
      const p = expectedGoals(foot(x, 50));
      expect(p).toBeGreaterThan(previous);
      previous = p;
    }
  });

  it('rates a header below the same shot taken with a foot and a free kick above it', () => {
    const base = expectedGoals(foot(90, 50));
    expect(expectedGoals({ x: 90, y: 50, header: true, freeKick: false })).toBeLessThan(base);
    expect(expectedGoals({ x: 90, y: 50, header: false, freeKick: true })).toBeGreaterThan(base);
  });

  it('is mirror-symmetric about the centre line', () => {
    expect(expectedGoals(foot(88, 30))).toBeCloseTo(expectedGoals(foot(88, 70)), 12);
  });

  it('puts the penalty spot between 0.15 and 0.45', () => {
    const p = expectedGoals(foot(89.5, 50));
    expect(p).toBeGreaterThan(0.15);
    expect(p).toBeLessThan(0.45);
  });

  it('uses a supplied model and rejects a malformed one', () => {
    const flat: XgModel = {
      ...DEFAULT_XG_MODEL,
      featureNames: [],
      coefficients: [],
      intercept: 0,
    };
    expect(expectedGoals(foot(90, 50), flat)).toBe(0.5);
    expect(xgUnits(foot(90, 50), flat)).toBe(5000);
    expect(() => expectedGoals(foot(90, 50), { ...flat, coefficients: [1] })).toThrow(RangeError);
    expect(() =>
      expectedGoals(foot(90, 50), { ...flat, featureNames: ['toString'], coefficients: [1] }),
    ).toThrow(RangeError);
  });
});

describe('xgUnits', () => {
  it('returns whole numbers in 1/10,000 units', () => {
    const units = xgUnits(foot(94, 45));
    expect(Number.isInteger(units)).toBe(true);
    expect(units).toBe(Math.round(expectedGoals(foot(94, 45)) * 10_000));
  });
});

describe('validation', () => {
  const bad: [string, ShotInput][] = [
    ['x below 0', foot(-0.1, 50)],
    ['x above 100', foot(100.1, 50)],
    ['y below 0', foot(50, -1)],
    ['y above 100', foot(50, 101)],
    ['NaN x', foot(Number.NaN, 50)],
    ['infinite y', foot(50, Number.POSITIVE_INFINITY)],
  ];

  it.each(bad)('rejects %s with INVALID_EVENT', (_label, shot) => {
    for (const call of [shotFeatures, expectedGoals, xgUnits]) {
      try {
        call(shot);
        expect.unreachable('expected an EngineError');
      } catch (error) {
        expect(error).toBeInstanceOf(EngineError);
        expect((error as EngineError).code).toBe('INVALID_EVENT');
      }
    }
  });

  it('accepts the boundary values', () => {
    expect(() => expectedGoals(foot(0, 0))).not.toThrow();
    expect(() => expectedGoals(foot(100, 100))).not.toThrow();
  });
});
