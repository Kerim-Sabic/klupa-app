import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  EVEN_SHARES,
  EXACT_TEST_MAX_N,
  relativeAgeCheck,
  type QuarterCounts,
  type QuarterShares,
} from '../relativeAge';
import { EngineError } from '../types';

/*
 * Reference values were produced with SciPy 1.18.1 / NumPy 2.5.4 (research/.venv),
 * with E = [90.25, 91, 92, 92] / 365.25:
 *   survival: scipy.stats.beta.sf(E[0], 1 + q1, 1 + n - q1)
 *   p-value:  brute force over every composition (a, b, c, d) of n into four parts,
 *             summing scipy.stats.multinomial.pmf([a, b, c, d], n, E) over those with
 *             pmf <= pmf(observed) * (1 + 1e-7)
 */
const REFERENCE: readonly (readonly [QuarterCounts, number, number])[] = [
  [[3, 3, 2, 2], 0.7212815461237798, 0.8795106879283671],
  [[8, 3, 2, 1], 0.9961506361211768, 0.059817781342048695],
  [[10, 4, 3, 3], 0.9941603669189704, 0.10638607134888675],
  [[2, 2, 3, 3], 0.4642451307509261, 1.0000000000000007],
  [[6, 2, 4, 2], 0.9465205832781709, 0.3889111746480239],
  [[9, 1, 1, 1], 0.9998866586655067, 0.0025785556362591705],
  [[0, 0, 0, 12], 0.024983432131783032, 2.394340191348194e-7],
  [[5, 5, 5, 5], 0.5789480652250123, 0.9999999999999984],
  [[7, 5, 4, 4], 0.8768465731601182, 0.7620083818988272],
  [[14, 2, 2, 2], 0.9999912270391308, 0.0003212521761905581],
  [[12, 10, 8, 10], 0.8068467186799755, 0.8376618252023061],
];

/** Same brute-force enumeration, equal shares, n = 32: tied outcomes are plentiful. */
const EQUAL_SHARES_REFERENCE = {
  counts: [11, 9, 7, 5] as QuarterCounts,
  pValue: 0.49639787864728296,
};
const EQUAL: QuarterShares = [0.25, 0.25, 0.25, 0.25];

describe('relativeAgeCheck against SciPy', () => {
  it.each(REFERENCE)('counts %j', (counts, survival, pValue) => {
    const result = relativeAgeCheck(counts);
    expect(Math.abs(result.probabilityQ1Overrepresented - survival)).toBeLessThan(1e-6);
    expect(Math.abs((result.pValue ?? Number.NaN) - Math.min(1, pValue))).toBeLessThan(1e-6);
    expect(result.testMethod).toBe('exact');
  });

  it('matches the brute-force p-value with equal shares and many ties', () => {
    const result = relativeAgeCheck(EQUAL_SHARES_REFERENCE.counts, { expectedShares: EQUAL });
    expect(Math.abs((result.pValue ?? Number.NaN) - EQUAL_SHARES_REFERENCE.pValue)).toBeLessThan(
      1e-6,
    );
  });
});

describe('relativeAgeCheck results', () => {
  it('reports shares and the default days-per-quarter expectation', () => {
    const result = relativeAgeCheck([6, 2, 4, 2]);
    expect(result.n).toBe(14);
    expect(result.observedShares[0]).toBeCloseTo(6 / 14, 12);
    expect(result.q1Share).toBeCloseTo(6 / 14, 12);
    expect(result.expectedShares).toEqual(EVEN_SHARES);
    expect(EVEN_SHARES.reduce((sum, share) => sum + share, 0)).toBeCloseTo(1, 12);
    expect(EVEN_SHARES[0]).toBeCloseTo(90.25 / 365.25, 12);
  });

  it('says too few below eight players, whatever the numbers look like', () => {
    expect(relativeAgeCheck([7, 0, 0, 0]).verdict).toBe('too_few');
    expect(relativeAgeCheck([0, 0, 0, 0]).verdict).toBe('too_few');
    expect(relativeAgeCheck([0, 0, 0, 0]).pValue).toBe(1);
    expect(relativeAgeCheck([0, 0, 0, 0]).q1Share).toBe(0);
  });

  it('is consistent with even for a balanced squad, and does not call that fair', () => {
    const result = relativeAgeCheck([4, 4, 5, 5]);
    expect(result.verdict).toBe('consistent_with_even');
  });

  it('leans older when Q1 is clearly heavy but the test is not conclusive', () => {
    const result = relativeAgeCheck([8, 3, 2, 1]);
    expect(result.probabilityQ1Overrepresented).toBeGreaterThanOrEqual(0.975);
    expect(result.pValue).toBeGreaterThan(0.05);
    expect(result.verdict).toBe('leans_older');
  });

  it('is strongly older only with a high posterior and a small p-value', () => {
    const result = relativeAgeCheck([9, 1, 1, 1]);
    expect(result.verdict).toBe('strongly_older');
  });

  it('does not lean older when Q1 is the light quarter', () => {
    expect(relativeAgeCheck([0, 4, 4, 4]).verdict).toBe('consistent_with_even');
  });

  it('leans older at exactly the lower posterior band', () => {
    const result = relativeAgeCheck([6, 2, 4, 2]);
    expect(result.probabilityQ1Overrepresented).toBeGreaterThanOrEqual(0.9);
    expect(result.probabilityQ1Overrepresented).toBeLessThan(0.975);
    expect(result.verdict).toBe('leans_older');
  });

  it('skips the exact test above the cap and then cannot say strongly older', () => {
    const atCap = relativeAgeCheck([30, 10, 10, 10]);
    expect(EXACT_TEST_MAX_N).toBe(60);
    expect(atCap.testMethod).toBe('exact');
    expect(atCap.verdict).toBe('strongly_older');

    const above = relativeAgeCheck([31, 10, 10, 10]);
    expect(above.n).toBe(61);
    expect(above.testMethod).toBe('skipped');
    expect(above.pValue).toBeNull();
    expect(above.verdict).toBe('leans_older');
    expect(relativeAgeCheck([12, 17, 16, 16]).verdict).toBe('consistent_with_even');
  });

  it('accepts custom expected shares', () => {
    const lopsided: QuarterShares = [0.4, 0.2, 0.2, 0.2];
    const result = relativeAgeCheck([4, 2, 2, 2], { expectedShares: lopsided });
    expect(result.expectedShares).toEqual(lopsided);
    expect(result.pValue).toBeCloseTo(1, 6);
  });
});

describe('relativeAgeCheck validation', () => {
  it('rejects counts that are not four whole non-negative numbers', () => {
    expect(() => relativeAgeCheck([1, 2, 3, -1])).toThrow(EngineError);
    expect(() => relativeAgeCheck([1, 2, 3, 1.5])).toThrow(EngineError);
    expect(() => relativeAgeCheck([1, 2, 3, Number.NaN])).toThrow(EngineError);
    expect(() => relativeAgeCheck([1, 2, 3] as unknown as QuarterCounts)).toThrow(EngineError);
  });

  it('rejects expected shares that are not four positive numbers adding up to 1', () => {
    expect(() => relativeAgeCheck([2, 2, 2, 2], { expectedShares: [0.5, 0.5, 0.5, 0.5] })).toThrow(
      EngineError,
    );
    expect(() => relativeAgeCheck([2, 2, 2, 2], { expectedShares: [1, 0, 0, 0] })).toThrow(
      EngineError,
    );
    expect(() =>
      relativeAgeCheck([2, 2, 2, 2], {
        expectedShares: [0.25, 0.25, 0.25] as unknown as QuarterShares,
      }),
    ).toThrow(EngineError);
  });
});

describe('relativeAgeCheck properties', () => {
  const counts = fc.tuple(
    fc.integer({ min: 0, max: 15 }),
    fc.integer({ min: 0, max: 15 }),
    fc.integer({ min: 0, max: 15 }),
    fc.integer({ min: 0, max: 15 }),
  );

  it('keeps the p-value in (0, 1] and the posterior in [0, 1]', () => {
    fc.assert(
      fc.property(counts, (c) => {
        const result = relativeAgeCheck(c);
        expect(result.pValue).not.toBeNull();
        expect(result.pValue ?? 0).toBeGreaterThan(0);
        expect(result.pValue ?? 2).toBeLessThanOrEqual(1);
        expect(result.probabilityQ1Overrepresented).toBeGreaterThanOrEqual(0);
        expect(result.probabilityQ1Overrepresented).toBeLessThanOrEqual(1);
        expect(result.observedShares.reduce((sum, share) => sum + share, 0)).toBeCloseTo(
          result.n === 0 ? 0 : 1,
          12,
        );
      }),
      { numRuns: 100 },
    );
  });

  it('does not change when quarters with equal expected shares swap counts', () => {
    fc.assert(
      fc.property(counts, ([q1, q2, q3, q4]) => {
        // Q3 and Q4 are both 92 days long.
        const original = relativeAgeCheck([q1, q2, q3, q4]).pValue ?? Number.NaN;
        const swapped = relativeAgeCheck([q1, q2, q4, q3]).pValue ?? Number.NaN;
        expect(Math.abs(original - swapped)).toBeLessThan(1e-9);
      }),
      { numRuns: 100 },
    );
  });

  it('does not change under any permutation when the expected shares are equal', () => {
    fc.assert(
      fc.property(counts, fc.integer({ min: 0, max: 23 }), ([q1, q2, q3, q4], pick) => {
        const parts = [q1, q2, q3, q4];
        const permuted = permutation(parts, pick);
        const first =
          relativeAgeCheck([q1, q2, q3, q4], { expectedShares: EQUAL }).pValue ?? Number.NaN;
        const second = relativeAgeCheck(permuted, { expectedShares: EQUAL }).pValue ?? Number.NaN;
        expect(Math.abs(first - second)).toBeLessThan(1e-9);
      }),
      { numRuns: 100 },
    );
  });

  it('gives a more extreme squad a smaller or equal p-value than a balanced one', () => {
    fc.assert(
      fc.property(fc.integer({ min: 8, max: 40 }), (n) => {
        const balanced = relativeAgeCheck(balancedCounts(n)).pValue ?? 0;
        const piled = relativeAgeCheck([0, 0, 0, n]).pValue ?? 1;
        expect(piled).toBeLessThanOrEqual(balanced);
      }),
    );
  });
});

/** The pick-th permutation (0-23) of four numbers, as a tuple. */
function permutation(parts: readonly number[], pick: number): QuarterCounts {
  const pool = [...parts];
  const result: number[] = [];
  let rest = pick;
  for (let size = 4; size > 0; size -= 1) {
    const [taken] = pool.splice(rest % size, 1);
    rest = Math.floor(rest / size);
    result.push(taken ?? 0);
  }
  return [result[0] ?? 0, result[1] ?? 0, result[2] ?? 0, result[3] ?? 0];
}

function balancedCounts(n: number): QuarterCounts {
  const base = Math.floor(n / 4);
  const extra = n - base * 4;
  return [base + (extra > 0 ? 1 : 0), base + (extra > 1 ? 1 : 0), base + (extra > 2 ? 1 : 0), base];
}
