import { describe, expect, it } from 'vitest';
import scale from '../../../research/out/momentum_scale.json';
import cv from '../../../research/out/xg_cv.json';
import {
  axisCeiling,
  competitionBars,
  headline,
  pilotContext,
  reliabilityBins,
  xgMetrics,
  xgTrainingFacts,
} from './researchModel';

describe('research numbers come from the result files', () => {
  it('headline shares match the pooled totals', () => {
    const top = headline();
    expect(top.matches).toBe(scale.total.matches);
    expect(top.gridPoints).toBe(scale.total.gridPoints);
    expect(top.gridStepSeconds).toBe(scale.assumptions.gridStepSeconds);
    expect(top.opposedShare * 100).toBeCloseTo(scale.total.opposedPct, 10);
    expect(top.agreementShare * 100).toBeCloseTo(scale.total.agreementPct, 10);
    expect(top.robustShare).toBeCloseTo(scale.total.robust / scale.total.gridPoints, 12);
    // Robust agreement as a share of all moments is the agreement share times its robust part.
    expect(top.robustShare * 100).toBeCloseTo(
      (scale.total.agreementPct * scale.total.robustPctOfAgreement) / 100,
      8,
    );
  });

  it('lists every competition once, highest opposed share first', () => {
    const bars = competitionBars();
    expect(bars.map((bar) => bar.key).sort()).toEqual(Object.keys(scale.byCompetition).sort());
    for (const bar of bars) {
      const row = scale.byCompetition[bar.key];
      expect(bar.opposedShare * 100).toBeCloseTo(row.opposedPct, 10);
      expect(bar.matches).toBe(row.matches);
    }
    const shares = bars.map((bar) => bar.opposedShare);
    expect(shares).toEqual([...shares].sort((a, b) => b - a));
    expect(bars.reduce((sum, bar) => sum + bar.matches, 0)).toBe(scale.total.matches);
  });

  it('orders equal shares by name so the chart is stable', () => {
    const row = scale.byCompetition.England;
    const tied = {
      ...scale,
      byCompetition: { ...scale.byCompetition, Spain: row, Italy: row },
    };
    const keys = competitionBars(tied).map((bar) => bar.key);
    expect(keys.indexOf('Italy')).toBeLessThan(keys.indexOf('Spain'));
  });

  it('puts the seven-match pilot in the context of random seven-match draws', () => {
    const pilot = pilotContext();
    const subsets = scale.matchLevelSpread.random7MatchSubsets;
    expect(pilot.matches).toBe(scale.priorStudy.matches);
    expect(pilot.share * 100).toBeCloseTo(scale.priorStudy.pct, 1);
    expect(pilot.draws).toBe(subsets.draws);
    expect(pilot.low * 100).toBeCloseTo(subsets.p02_5_p50_p97_5[0] ?? Number.NaN, 10);
    expect(pilot.high * 100).toBeCloseTo(subsets.p02_5_p50_p97_5[2] ?? Number.NaN, 10);
    expect(pilot.tail).toBe(subsets.shareAtOrAbove23_9);
    expect(pilot.share).toBeGreaterThan(headline().opposedShare);
  });

  it('reports the xG model against the base rate exactly as cross-validated', () => {
    expect(xgMetrics()).toEqual([
      { key: 'model', ...pick(cv.groupedCv.model) },
      { key: 'baseline', ...pick(cv.groupedCv.baseline) },
    ]);
    const [model, baseline] = xgMetrics();
    expect(model?.logLoss).toBeLessThan(baseline?.logLoss ?? 0);
    expect(xgTrainingFacts()).toEqual({
      shots: cv.nShots,
      goals: cv.nGoals,
      matches: cv.nMatches,
      folds: cv.groupedCv.perFoldLogLoss.length,
      ece: cv.reliabilityGroupedCv.ece,
    });
  });

  it('keeps every reliability bin', () => {
    const bins = reliabilityBins();
    expect(bins).toHaveLength(cv.reliabilityGroupedCv.bins.length);
    bins.forEach((bin, index) => {
      const source = cv.reliabilityGroupedCv.bins[index];
      expect(bin).toEqual({
        n: source?.n,
        predicted: source?.meanPredicted,
        observed: source?.observedRate,
      });
    });
  });
});

function pick(metrics: { logLoss: number; brier: number; auc: number }) {
  return { logLoss: metrics.logLoss, brier: metrics.brier, auc: metrics.auc };
}

describe('axisCeiling', () => {
  it('picks the smallest step that holds every value', () => {
    expect(axisCeiling([0.12, 0.36], [0.1, 0.2, 0.4])).toBe(0.4);
    expect(axisCeiling([0.2], [0.1, 0.2, 0.4])).toBe(0.2);
    expect(axisCeiling([], [0.1])).toBe(0.1);
    expect(axisCeiling([3], [0.1, 1])).toBe(3);
  });
});
