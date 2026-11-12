import { EngineError } from './types';

/*
 * Credible intervals for a rate, with no dependencies.
 *
 * The opportunity ledger shows a "shrunk" rate: a success rate pulled towards the
 * squad's rate in proportion to how little was observed. That number is the mean
 * of a Beta posterior. This module draws the spread around it, so two successes
 * from two attempts is visibly a wide, uncertain interval and not a point.
 *
 * The regularised incomplete beta function I_x(a, b) is the Beta CDF. It is
 * evaluated with the standard continued fraction (modified Lentz) and inverted
 * by bisection: slower than Newton, but it cannot diverge and ~100 halvings
 * reach double precision. Accuracy was checked against SciPy's beta.cdf, sf and
 * ppf (see the tests), including shape parameters below 1 and above 500.
 *
 * Nothing here predicts anything about a child. An interval describes how
 * little we know from what was observed, never what will happen.
 */

export interface BetaInterval {
  readonly lower: number;
  readonly upper: number;
}

/** Lanczos approximation (g = 7, n = 9): about 15 significant digits for z > 0. */
const LANCZOS: readonly number[] = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
  1.5056327351493116e-7,
];
const HALF_LOG_TWO_PI = 0.5 * Math.log(2 * Math.PI);

function logGamma(z: number): number {
  if (z < 0.5) {
    // Reflection keeps shape parameters below 0.5 accurate.
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  }
  const shifted = z - 1;
  const series = LANCZOS.reduce(
    (sum, coefficient, index) =>
      index === 0 ? coefficient : sum + coefficient / (shifted + index),
    0,
  );
  const t = shifted + 7.5;
  return HALF_LOG_TWO_PI + (shifted + 0.5) * Math.log(t) - t + Math.log(series);
}

const TINY = 1e-300;
const EPSILON = 3e-16;
/** The fraction converges in about sqrt(max(a, b)) steps; this is far beyond any real squad. */
const MAX_ITERATIONS = 10_000;

function nonZero(value: number): number {
  return Math.abs(value) < TINY ? TINY : value;
}

/** Continued fraction for the incomplete beta function (modified Lentz). */
function betaFraction(x: number, a: number, b: number): number {
  const sum = a + b;
  let c = 1;
  let d = 1 / nonZero(1 - (sum * x) / (a + 1));
  let h = d;
  for (let m = 1; m <= MAX_ITERATIONS; m += 1) {
    const twice = 2 * m;
    const even = (m * (b - m) * x) / ((a - 1 + twice) * (a + twice));
    d = 1 / nonZero(1 + even * d);
    c = nonZero(1 + even / c);
    h *= d * c;
    const odd = (-(a + m) * (sum + m) * x) / ((a + twice) * (a + 1 + twice));
    d = 1 / nonZero(1 + odd * d);
    c = nonZero(1 + odd / c);
    const step = d * c;
    h *= step;
    if (Math.abs(step - 1) < EPSILON) break;
  }
  return h;
}

function assertShape(a: number, b: number): void {
  if (!(Number.isFinite(a) && a > 0 && Number.isFinite(b) && b > 0)) {
    throw new EngineError('INVALID_EXPOSURE', 'Beta shape parameters must be finite and above 0.');
  }
}

/** Regularised incomplete beta function I_x(a, b): the CDF of Beta(a, b) at x. */
export function regularizedIncompleteBeta(x: number, a: number, b: number): number {
  assertShape(a, b);
  if (Number.isNaN(x)) throw new EngineError('INVALID_EXPOSURE', 'x must be a number.');
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(
    logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log1p(-x),
  );
  // The fraction converges fast below the mean; above it use the mirror identity.
  if (x < (a + 1) / (a + b + 2)) return (front * betaFraction(x, a, b)) / a;
  return 1 - (front * betaFraction(1 - x, b, a)) / b;
}

/**
 * P(X > x) for X ~ Beta(a, b). Computed through the mirror identity rather than
 * 1 - CDF, so a small upper tail keeps its precision.
 */
export function betaSurvival(x: number, a: number, b: number): number {
  return regularizedIncompleteBeta(1 - x, b, a);
}

/** The x with CDF(x) = probability, by bisection on [0, 1]. */
export function betaQuantile(probability: number, a: number, b: number): number {
  assertShape(a, b);
  if (!(probability >= 0 && probability <= 1)) {
    throw new EngineError('INVALID_EXPOSURE', 'Probability must be between 0 and 1.');
  }
  // The end points are exact; bisection would stop at the last x whose CDF rounds to 0 or 1.
  if (probability === 0) return 0;
  if (probability === 1) return 1;
  let low = 0;
  let high = 1;
  for (let step = 0; step < 200; step += 1) {
    const middle = (low + high) / 2;
    // Stop once the interval cannot be halved in double precision.
    if (middle === low || middle === high) break;
    if (regularizedIncompleteBeta(middle, a, b) < probability) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}

/**
 * Equal-tailed credible interval of the posterior for a rate. The prior is
 * Beta(priorMean * priorStrength, (1 - priorMean) * priorStrength), the same
 * prior `shrunkRate` uses, so the posterior mean is exactly the shrunk rate.
 *
 * `level` is the share of the posterior inside the interval (default 90%).
 * For a very lopsided posterior (a prior mean near 0 or 1 with few attempts)
 * the mean can sit just outside an equal-tailed interval; that is a property
 * of the distribution, not an error. A prior mean of exactly 0 or 1 gives a
 * degenerate posterior when the matching count is 0, and is rejected.
 */
export function betaInterval(
  successes: number,
  attempts: number,
  priorMean: number,
  priorStrength: number,
  level = 0.9,
): BetaInterval {
  const whole = (value: number): boolean => Number.isSafeInteger(value) && value >= 0;
  if (!whole(attempts) || !whole(successes) || successes > attempts) {
    throw new EngineError(
      'INVALID_EXPOSURE',
      'Attempts and successes must be whole numbers, successes <= attempts.',
    );
  }
  if (
    !(priorMean >= 0 && priorMean <= 1) ||
    !(priorStrength > 0) ||
    !Number.isFinite(priorStrength)
  ) {
    throw new EngineError('INVALID_EXPOSURE', 'Prior mean must be in [0, 1] and strength above 0.');
  }
  if (!(level > 0 && level < 1)) {
    throw new EngineError('INVALID_EXPOSURE', 'Interval level must be between 0 and 1.');
  }
  const alpha = successes + priorMean * priorStrength;
  const beta = attempts - successes + (1 - priorMean) * priorStrength;
  if (!(alpha > 0 && beta > 0)) {
    throw new EngineError(
      'INVALID_EXPOSURE',
      'A prior mean of 0 or 1 with no opposing observation leaves nothing to interval.',
    );
  }
  const tail = (1 - level) / 2;
  return { lower: betaQuantile(tail, alpha, beta), upper: betaQuantile(1 - tail, alpha, beta) };
}
