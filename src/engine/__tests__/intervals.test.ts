import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { betaInterval, betaQuantile, betaSurvival, regularizedIncompleteBeta } from '../intervals';
import { shrunkRate } from '../opportunity';
import { EngineError } from '../types';

/*
 * Reference values were produced with SciPy 1.18.1 / NumPy 2.5.4 (research/.venv):
 *   a = s + m*k;  b = n - s + (1 - m)*k;  tail = (1 - level) / 2
 *   scipy.stats.beta.ppf(tail, a, b), scipy.stats.beta.ppf(1 - tail, a, b)
 * Columns: successes, attempts, priorMean, priorStrength, level, lower, upper.
 */
const INTERVAL_REFERENCE: readonly (readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
])[] = [
  [2, 2, 0.5, 10, 0.9, 0.3498115345719175, 0.8004238501161631],
  [0, 0, 0.6, 10, 0.9, 0.3449413659437031, 0.8312495040126759],
  [16, 20, 0.5, 10, 0.9, 0.5570640980074919, 0.8275351805963891],
  [9, 18, 0.5, 10, 0.9, 0.3469716996903496, 0.6530283003096504],
  [0, 7, 0.35, 10, 0.9, 0.07101891487007578, 0.3809107826973856],
  [3, 5, 0.42, 4, 0.8, 0.30975210387987057, 0.7280334737719434],
  [120, 400, 0.3, 10, 0.95, 0.25665072236788106, 0.3451973871357487],
  [1, 1, 0.9, 1, 0.9, 0.6774731482876588, 0.9999999999999598],
  [0, 3, 0.05, 2, 0.9, 1.3299945627565327e-14, 0.12192607081483665],
  [250, 500, 0.5, 25, 0.99, 0.44394142934765074, 0.5560585706523493],
];

describe('betaInterval against SciPy', () => {
  it.each(INTERVAL_REFERENCE)(
    '%i from %i, prior %f x %i, level %f',
    (successes, attempts, priorMean, priorStrength, level, lower, upper) => {
      const interval = betaInterval(successes, attempts, priorMean, priorStrength, level);
      expect(Math.abs(interval.lower - lower)).toBeLessThan(1e-6);
      expect(Math.abs(interval.upper - upper)).toBeLessThan(1e-6);
    },
  );

  it('defaults to a 90% interval', () => {
    const [successes, attempts, priorMean, priorStrength, , lower, upper] =
      INTERVAL_REFERENCE[2] ?? [0, 0, 0, 0, 0, 0, 0];
    const interval = betaInterval(successes, attempts, priorMean, priorStrength);
    expect(Math.abs(interval.lower - lower)).toBeLessThan(1e-6);
    expect(Math.abs(interval.upper - upper)).toBeLessThan(1e-6);
  });

  it('makes two from two visibly wider than sixteen from twenty', () => {
    const barelyWatched = betaInterval(2, 2, 0.5, 10);
    const watched = betaInterval(16, 20, 0.5, 10);
    expect(barelyWatched.upper - barelyWatched.lower).toBeGreaterThan(
      watched.upper - watched.lower,
    );
  });
});

describe('regularizedIncompleteBeta and betaSurvival', () => {
  // scipy.stats.beta.cdf / .sf at the given point; produced like the intervals above.
  it('matches closed forms', () => {
    expect(regularizedIncompleteBeta(0.3, 1, 1)).toBeCloseTo(0.3, 12);
    expect(regularizedIncompleteBeta(0.5, 3, 3)).toBeCloseTo(0.5, 12);
    // Beta(2, 1) has CDF x^2.
    expect(regularizedIncompleteBeta(0.6, 2, 1)).toBeCloseTo(0.36, 12);
    expect(betaSurvival(0.6, 2, 1)).toBeCloseTo(0.64, 12);
  });

  it('clamps outside the unit interval and rejects nonsense', () => {
    expect(regularizedIncompleteBeta(-1, 2, 3)).toBe(0);
    expect(regularizedIncompleteBeta(0, 2, 3)).toBe(0);
    expect(regularizedIncompleteBeta(1, 2, 3)).toBe(1);
    expect(regularizedIncompleteBeta(7, 2, 3)).toBe(1);
    expect(() => regularizedIncompleteBeta(Number.NaN, 2, 3)).toThrow(EngineError);
    expect(() => regularizedIncompleteBeta(0.5, 0, 3)).toThrow(EngineError);
    expect(() => regularizedIncompleteBeta(0.5, 2, Number.POSITIVE_INFINITY)).toThrow(EngineError);
  });

  it('handles both sides of the mean and shapes below 1', () => {
    for (const x of [0.01, 0.2, 0.5, 0.8, 0.99]) {
      expect(regularizedIncompleteBeta(x, 0.4, 0.7) + betaSurvival(x, 0.4, 0.7)).toBeCloseTo(1, 12);
    }
  });
});

describe('betaQuantile', () => {
  it('inverts the CDF and handles the end points', () => {
    expect(betaQuantile(0.5, 4, 4)).toBeCloseTo(0.5, 12);
    expect(regularizedIncompleteBeta(betaQuantile(0.123, 2.5, 7), 2.5, 7)).toBeCloseTo(0.123, 10);
    expect(betaQuantile(0, 2, 3)).toBe(0);
    expect(betaQuantile(1, 2, 3)).toBe(1);
  });

  it('rejects an impossible probability', () => {
    expect(() => betaQuantile(1.5, 2, 3)).toThrow(EngineError);
    expect(() => betaQuantile(Number.NaN, 2, 3)).toThrow(EngineError);
  });
});

describe('betaInterval validation', () => {
  it('rejects counts that cannot be observed', () => {
    expect(() => betaInterval(3, 2, 0.5, 10)).toThrow(EngineError);
    expect(() => betaInterval(1.5, 4, 0.5, 10)).toThrow(EngineError);
    expect(() => betaInterval(-1, 4, 0.5, 10)).toThrow(EngineError);
    expect(() => betaInterval(1, Number.NaN, 0.5, 10)).toThrow(EngineError);
  });

  it('rejects a bad prior or level', () => {
    expect(() => betaInterval(1, 2, 1.5, 10)).toThrow(EngineError);
    expect(() => betaInterval(1, 2, -0.1, 10)).toThrow(EngineError);
    expect(() => betaInterval(1, 2, 0.5, 0)).toThrow(EngineError);
    expect(() => betaInterval(1, 2, 0.5, Number.POSITIVE_INFINITY)).toThrow(EngineError);
    expect(() => betaInterval(1, 2, 0.5, 10, 1)).toThrow(EngineError);
    expect(() => betaInterval(1, 2, 0.5, 10, 0)).toThrow(EngineError);
  });

  it('rejects a degenerate posterior', () => {
    expect(() => betaInterval(0, 0, 0, 10)).toThrow(EngineError);
    expect(() => betaInterval(3, 3, 1, 10)).toThrow(EngineError);
    expect(() => betaInterval(0, 1, 1, 10)).not.toThrow();
  });

  it('carries a stable error code', () => {
    try {
      betaInterval(3, 2, 0.5, 10);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(EngineError);
      expect((error as EngineError).code).toBe('INVALID_EXPOSURE');
    }
  });
});

// The mean is only guaranteed inside an equal-tailed interval for moderately shaped posteriors;
// a prior mean near 0 or 1 at a low level can put it outside. The domain below is the one the app uses.
describe('betaInterval properties', () => {
  const scenario = fc
    .record({
      attempts: fc.integer({ min: 0, max: 500 }),
      share: fc.double({ min: 0, max: 1, noNaN: true }),
      priorMean: fc.double({ min: 0.1, max: 0.9, noNaN: true }),
      priorStrength: fc.double({ min: 2, max: 100, noNaN: true }),
      level: fc.double({ min: 0.8, max: 0.99, noNaN: true }),
    })
    .map((input) => ({ ...input, successes: Math.round(input.attempts * input.share) }));

  it('is ordered, inside [0, 1] and contains the posterior mean', () => {
    fc.assert(
      fc.property(scenario, (s) => {
        const { lower, upper } = betaInterval(
          s.successes,
          s.attempts,
          s.priorMean,
          s.priorStrength,
          s.level,
        );
        const mean = shrunkRate(s.successes, s.attempts, s.priorMean, s.priorStrength);
        expect(lower).toBeGreaterThanOrEqual(0);
        expect(upper).toBeLessThanOrEqual(1);
        expect(lower).toBeLessThanOrEqual(upper);
        expect(mean).toBeGreaterThanOrEqual(lower - 1e-9);
        expect(mean).toBeLessThanOrEqual(upper + 1e-9);
      }),
      { numRuns: 300 },
    );
  });

  it('narrows as more is observed when the data agree with the prior', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 50 }), (pairs) => {
        const small = betaInterval(pairs, pairs * 2, 0.5, 10);
        const large = betaInterval(pairs * 4, pairs * 8, 0.5, 10);
        expect(large.upper - large.lower).toBeLessThan(small.upper - small.lower);
      }),
    );
  });
});
