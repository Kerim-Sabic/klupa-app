import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compareWindows, momentumSeries, summariseSeries } from '../momentum';
import type { EvidenceEvent, Side } from '../types';

/**
 * Scale golden test. research/momentum/scale_validation.py measured window
 * sensitivity on all 1,941 matches of the open Wyscout dataset (Pappalardo et
 * al. 2019, CC BY 4.0), weighting each shot with our own xG model. This test
 * runs the production TypeScript engine over the same shots and must arrive at
 * exactly the same counts. Two independent implementations, one answer.
 */
interface ShotRow {
  readonly t: number;
  readonly side: Side;
  readonly w: number;
}
interface MatchRow {
  readonly id: number | string;
  readonly competition: string;
  readonly halves: readonly {
    readonly period: number;
    readonly durationSeconds: number;
    readonly shots: readonly ShotRow[];
  }[];
}
interface ScaleTotals {
  readonly gridPoints: number;
  readonly bothNonZero: number;
  readonly opposite: number;
  readonly agreement: number;
  readonly robust: number;
  readonly canReverse: number;
  readonly tieOnly: number;
}

function load(file: string): unknown {
  return JSON.parse(readFileSync(resolve(process.cwd(), 'research/out', file), 'utf8'));
}

describe('1,941-match Wyscout validation (golden, at scale)', () => {
  it('reproduces the Python study count for count', { timeout: 180_000 }, () => {
    const matches = load('wyscout_shots.json') as readonly MatchRow[];
    const expected = (load('momentum_scale.json') as { readonly total: ScaleTotals }).total;
    const totals = { grid: 0, bothNonzero: 0, opposite: 0, agreement: 0, robust: 0, canReverse: 0 };

    for (const match of matches) {
      for (const half of match.halves) {
        const events: EvidenceEvent[] = half.shots.map((shot, index) => ({
          id: `${String(match.id)}:${String(half.period)}:${String(index)}`,
          period: half.period,
          t: shot.t,
          side: shot.side,
          weight: shot.w,
        }));
        const readings = momentumSeries(events, half.period, half.durationSeconds, 5);
        const comparison = compareWindows(readings, 180, 600);
        const summary = summariseSeries(readings);
        totals.grid += readings.length;
        totals.bothNonzero += comparison.bothNonzero;
        totals.opposite += comparison.opposite;
        totals.agreement += summary.agreement;
        totals.robust += summary.agreementRobust;
        totals.canReverse += summary.agreementCanReverse;
      }
    }

    expect(matches).toHaveLength(1941);
    expect(totals).toEqual({
      grid: expected.gridPoints,
      bothNonzero: expected.bothNonZero,
      opposite: expected.opposite,
      agreement: expected.agreement,
      robust: expected.robust,
      canReverse: expected.canReverse,
    });
    // What is left can be levelled, but not reversed, by removing one shot.
    expect(totals.agreement - totals.robust - totals.canReverse).toBe(expected.tieOnly);
    // The headline: windows point at opposite teams at about one moment in five.
    expect(totals.opposite / totals.bothNonzero).toBeCloseTo(0.189, 3);
  });
});
