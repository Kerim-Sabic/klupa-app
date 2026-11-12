import { betaSurvival } from './intervals';
import { EngineError } from './types';

/*
 * Relative-age check for one small squad.
 *
 * Children born early in a selection year are older than their age-group peers,
 * and in youth football that tends to show up as more of them being picked and
 * played. This asks one question of a squad's birth quarters: does it look
 * different from an even spread across the year?
 *
 * Two readings are given, because with 14-20 players neither is strong:
 *  - an EXACT multinomial goodness-of-fit p-value (no chi-square approximation,
 *    which is unreliable at these counts), and
 *  - the posterior probability that the true share of January-March births
 *    is above its even-spread share, from a Beta posterior on "Q1 versus the
 *    rest" with a uniform Beta(1, 1) prior.
 *
 * LOW POWER. With 14-20 players the test can only see a very large imbalance.
 * "Consistent with even" therefore means "this squad cannot tell", not "this
 * squad is fair". The verdict never says a squad is fair. It is also a
 * statement about a group; it says nothing about any individual child, and no
 * birth date is ever needed, only the quarter.
 *
 * Above EXACT_TEST_MAX_N players the exact enumeration is skipped (the count of
 * outcomes, and the point of a small-squad check, both stop making sense):
 * `pValue` is null and `testMethod` is 'skipped'. The posterior still works,
 * and the verdict can then reach 'leans_older' but never 'strongly_older',
 * because that label needs the p-value.
 */

export type QuarterCounts = readonly [number, number, number, number];
export type QuarterShares = readonly [number, number, number, number];

export type RelativeAgeVerdict =
  'too_few' | 'consistent_with_even' | 'leans_older' | 'strongly_older';

export interface RelativeAgeOptions {
  /** Even-spread shares per quarter; default is days per quarter over 365.25. */
  readonly expectedShares?: QuarterShares;
}

export interface RelativeAgeResult {
  /** Players with a known birth quarter. */
  readonly n: number;
  readonly observedShares: QuarterShares;
  readonly expectedShares: QuarterShares;
  /** Exact multinomial goodness-of-fit p-value, or null when `testMethod` is 'skipped'. */
  readonly pValue: number | null;
  readonly testMethod: 'exact' | 'skipped';
  /** Observed share born in January-March. */
  readonly q1Share: number;
  /** Posterior probability that the true Q1 share is above its expected share. */
  readonly probabilityQ1Overrepresented: number;
  readonly verdict: RelativeAgeVerdict;
}

/** Largest squad for which the exact test is run. 39,711 outcomes at the cap: instant. */
export const EXACT_TEST_MAX_N = 60;
/** Fewer players than this and nothing is said. */
export const MIN_PLAYERS = 8;
/** Days per quarter of a mean year, so Q1 (which holds February) is the shortest. */
export const EVEN_SHARES: QuarterShares = [90.25 / 365.25, 91 / 365.25, 92 / 365.25, 92 / 365.25];

const LEANS_OLDER_AT = 0.9;
const STRONGLY_OLDER_AT = 0.975;
const SIGNIFICANCE = 0.05;
/** Outcomes whose probability is within this relative error of the observed one count as ties. */
const TIE_TOLERANCE = 1e-7;

function assertCounts(tuple: QuarterCounts): void {
  // Typed as a tuple, but callers outside TypeScript can still pass any array.
  const counts: readonly number[] = tuple;
  if (counts.length !== 4 || counts.some((count) => !Number.isSafeInteger(count) || count < 0)) {
    throw new EngineError(
      'INVALID_EXPOSURE',
      'Quarter counts must be four whole numbers, 0 or more.',
    );
  }
}

function assertShares(tuple: QuarterShares): void {
  const shares: readonly number[] = tuple;
  const sum = shares.reduce((total, share) => total + share, 0);
  if (
    shares.length !== 4 ||
    shares.some((share) => !(Number.isFinite(share) && share > 0)) ||
    Math.abs(sum - 1) > 1e-6
  ) {
    throw new EngineError(
      'INVALID_EXPOSURE',
      'Expected shares must be four positive numbers adding up to 1.',
    );
  }
}

/** ln(k!) for k = 0..n, summed directly so it is exact to rounding. */
function logFactorials(n: number): readonly number[] {
  const table = [0];
  for (let k = 1; k <= n; k += 1) table.push((table[k - 1] ?? 0) + Math.log(k));
  return table;
}

/**
 * Sum the probabilities of every outcome (every way to split n into four
 * quarters) that is no more likely than the observed one. Ties count, within
 * a relative tolerance, so floating-point noise cannot split equal outcomes.
 */
function exactPValue(counts: QuarterCounts, shares: QuarterShares): number {
  const n = counts.reduce((total, count) => total + count, 0);
  const logFact = logFactorials(n);
  const logShare = shares.map((share) => Math.log(share));
  const logProbability = (parts: readonly number[]): number =>
    (logFact[n] ?? 0) +
    parts.reduce(
      (sum, part, index) => sum + part * (logShare[index] ?? 0) - (logFact[part] ?? 0),
      0,
    );

  const cutoff = logProbability(counts) + Math.log1p(TIE_TOLERANCE);
  let total = 0;
  for (let a = 0; a <= n; a += 1) {
    for (let b = 0; b <= n - a; b += 1) {
      for (let c = 0; c <= n - a - b; c += 1) {
        const logP = logProbability([a, b, c, n - a - b - c]);
        if (logP <= cutoff) total += Math.exp(logP);
      }
    }
  }
  return Math.min(1, total);
}

function verdictFor(n: number, posterior: number, pValue: number | null): RelativeAgeVerdict {
  if (n < MIN_PLAYERS) return 'too_few';
  if (posterior >= STRONGLY_OLDER_AT && pValue !== null && pValue < SIGNIFICANCE) {
    return 'strongly_older';
  }
  return posterior >= LEANS_OLDER_AT ? 'leans_older' : 'consistent_with_even';
}

/**
 * Check whether a squad's birth quarters lean towards the oldest children of
 * the selection year. `counts` is the number of players born in Q1..Q4.
 */
export function relativeAgeCheck(
  counts: QuarterCounts,
  options: RelativeAgeOptions = {},
): RelativeAgeResult {
  assertCounts(counts);
  const expectedShares = options.expectedShares ?? EVEN_SHARES;
  assertShares(expectedShares);

  const n = counts.reduce((total, count) => total + count, 0);
  const share = (count: number): number => (n === 0 ? 0 : count / n);
  const observedShares: QuarterShares = [
    share(counts[0]),
    share(counts[1]),
    share(counts[2]),
    share(counts[3]),
  ];
  const q1 = counts[0];
  const q1Expected = expectedShares[0];
  const probabilityQ1Overrepresented = betaSurvival(q1Expected, 1 + q1, 1 + n - q1);
  const exact = n <= EXACT_TEST_MAX_N;
  const pValue = exact ? exactPValue(counts, expectedShares) : null;

  return {
    n,
    observedShares,
    expectedShares,
    pValue,
    testMethod: exact ? 'exact' : 'skipped',
    q1Share: observedShares[0],
    probabilityQ1Overrepresented,
    verdict: verdictFor(n, probabilityQ1Overrepresented, pValue),
  };
}
