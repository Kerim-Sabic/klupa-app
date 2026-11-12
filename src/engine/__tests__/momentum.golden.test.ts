import { describe, expect, it } from 'vitest';
import { demoMatches } from '../../data/dfl';
import { compareWindows, momentumSeries, summariseSeries, type MomentumReading } from '../momentum';
import type { EvidenceEvent } from '../types';
import expected from './dfl-expected.json';

/**
 * Golden tests: this TypeScript engine must reproduce the numbers the Python
 * research scripts measured on the seven checksum-verified DFL matches
 * (omega-validation/run_validation.py and omega_stability_test.py).
 * If a refactor changes any of these, the product no longer matches its evidence.
 */
function seriesFor(events: readonly EvidenceEvent[], matchId: string): MomentumReading[] {
  const match = demoMatches.find((candidate) => candidate.id === matchId);
  if (match === undefined) throw new Error(`Unknown match ${matchId}`);
  return match.periods.flatMap((period) =>
    momentumSeries(events, period.period, period.durationSeconds, 5),
  );
}

const perMatch = demoMatches.map((match) => ({
  id: match.id,
  xg: seriesFor(match.events, match.id),
  count: seriesFor(
    match.events.map((event) => ({ ...event, weight: 1 })),
    match.id,
  ),
}));
const allXg = perMatch.flatMap((match) => match.xg);

describe('seven-match DFL validation (golden)', () => {
  it('loads seven matches and 171 shots', () => {
    expect(demoMatches).toHaveLength(7);
    expect(demoMatches.reduce((sum, match) => sum + match.events.length, 0)).toBe(171);
    for (const match of demoMatches) {
      expect(match.events).toHaveLength(expected.shots[match.id as keyof typeof expected.shots]);
    }
  });

  it('samples the same 8,011-point five-second grid', () => {
    expect(allXg).toHaveLength(expected.xg3_xg10.totals.grid);
    expect(allXg).toHaveLength(8011);
  });

  it('3- and 10-minute xG windows favour opposite sides at 1,034 of 4,318 points (23.9%)', () => {
    const comparison = compareWindows(allXg, 180, 600);
    expect(comparison.bothNonzero).toBe(expected.xg3_xg10.totals.both_nonzero);
    expect(comparison.opposite).toBe(expected.xg3_xg10.totals.opposite);
    expect(comparison).toMatchObject({ bothNonzero: 4318, opposite: 1034 });
  });

  it('matches the research per match, not only in total', () => {
    for (const match of perMatch) {
      const reference = expected.perMatch[match.id as keyof typeof expected.perMatch].xg3_xg10;
      const comparison = compareWindows(match.xg, 180, 600);
      expect(comparison.grid).toBe(reference.grid);
      expect(comparison.bothNonzero).toBe(reference.both_nonzero);
      expect(comparison.opposite).toBe(reference.opposite);
    }
  });

  it('chance-weighted and shot-count views disagree at 175 of 4,776 points (3.7%)', () => {
    let bothNonzero = 0;
    let opposite = 0;
    for (const match of perMatch) {
      match.xg.forEach((reading, index) => {
        const xgLean = reading.windows[1]?.lean ?? 0;
        const countLean = match.count[index]?.windows[1]?.lean ?? 0;
        if (xgLean !== 0 && countLean !== 0) {
          bothNonzero += 1;
          if (xgLean !== countLean) opposite += 1;
        }
      });
    }
    expect(bothNonzero).toBe(expected.xg5_count5.totals.both_nonzero);
    expect(opposite).toBe(expected.xg5_count5.totals.opposite);
  });

  it('reproduces the one-shot deletion stress test', () => {
    const summary = summariseSeries(allXg);
    // All three windows favour the same side: 3,158 / 8,011 = 39.4%.
    expect(summary.agreement).toBe(3158);
    // ...and survive every single-shot omission: 479 (6.0% of the grid).
    expect(summary.agreementRobust).toBe(479);
    // ...but one omission can reverse at least one window: 1,119.
    expect(summary.agreementCanReverse).toBe(1119);
    // The rest can be levelled but not reversed: 1,560.
    expect(summary.agreement - summary.agreementRobust - summary.agreementCanReverse).toBe(1560);
    // 1,129 grid points have no shot at all in the previous ten minutes.
    expect(summary.byState.insufficient).toBe(expected.xg3_xg10.totals.no_shots_in_comparison_span);
  });
});
