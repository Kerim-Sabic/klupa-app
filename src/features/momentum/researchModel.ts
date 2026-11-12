import momentumScale from '../../../research/out/momentum_scale.json';
import xgCv from '../../../research/out/xg_cv.json';

/**
 * Everything the evidence page says about the research comes from the result files the
 * research scripts wrote, so the page cannot drift from the study. Helpers take the data
 * as an argument (defaulting to the files) so tests can check them on the real numbers.
 */
export type MomentumScale = typeof momentumScale;
export type XgCv = typeof xgCv;
export type CompetitionKey = keyof MomentumScale['byCompetition'];

/**
 * The momentum forecaster we tested and did not ship (docs/PLAN.md, research log). These
 * two numbers are not in the result files, so they live here, once, with their source.
 * Leave-one-match-out log loss for predicting the next shot; lower is better.
 */
export const REJECTED_FORECASTER = { recencyLogLoss: 1.0954, withXgLeaderLogLoss: 1.1235 } as const;

export interface Headline {
  readonly matches: number;
  readonly gridPoints: number;
  /** Seconds between moments on the reading grid. */
  readonly gridStepSeconds: number;
  /** Of the moments where the 3- and 10-minute windows both lean, the share that disagree. */
  readonly opposedShare: number;
  readonly bothNonZero: number;
  /** Of all moments, the share where every window agrees and no single shot can flip it. */
  readonly robustShare: number;
  /** Of all moments, the share where every window agrees (robust or not). */
  readonly agreementShare: number;
}

export function headline(data: MomentumScale = momentumScale): Headline {
  const { total } = data;
  return {
    matches: total.matches,
    gridPoints: total.gridPoints,
    gridStepSeconds: data.assumptions.gridStepSeconds,
    opposedShare: total.opposite / total.bothNonZero,
    bothNonZero: total.bothNonZero,
    robustShare: total.robust / total.gridPoints,
    agreementShare: total.agreement / total.gridPoints,
  };
}

export interface CompetitionBar {
  readonly key: CompetitionKey;
  readonly matches: number;
  readonly opposedShare: number;
}

/** Opposed-window share per competition, highest first (ties by name, so order is stable). */
export function competitionBars(data: MomentumScale = momentumScale): CompetitionBar[] {
  return (Object.keys(data.byCompetition) as CompetitionKey[])
    .map((key) => {
      const row = data.byCompetition[key];
      return { key, matches: row.matches, opposedShare: row.opposite / row.bothNonZero };
    })
    .sort((a, b) => b.opposedShare - a.opposedShare || a.key.localeCompare(b.key));
}

export interface PilotContext {
  readonly matches: number;
  readonly share: number;
  readonly draws: number;
  /** 2.5th and 97.5th percentile of the pooled share over random seven-match subsets. */
  readonly low: number;
  readonly high: number;
  /** Share of those subsets at or above the pilot's value. */
  readonly tail: number;
}

/** The seven-match pilot, and how much seven matches can vary in the large data. */
export function pilotContext(data: MomentumScale = momentumScale): PilotContext {
  const subsets = data.matchLevelSpread.random7MatchSubsets;
  const [low = 0, , high = 0] = subsets.p02_5_p50_p97_5;
  return {
    matches: data.priorStudy.matches,
    share: data.priorStudy.opposite / data.priorStudy.bothNonZero,
    draws: subsets.draws,
    low: low / 100,
    high: high / 100,
    tail: subsets.shareAtOrAbove23_9,
  };
}

export interface MetricRow {
  readonly key: 'model' | 'baseline';
  readonly logLoss: number;
  readonly brier: number;
  readonly auc: number;
}

/** Grouped-by-match cross-validation: our model against the base rate. */
export function xgMetrics(data: XgCv = xgCv): MetricRow[] {
  const { model, baseline } = data.groupedCv;
  return [
    { key: 'model', logLoss: model.logLoss, brier: model.brier, auc: model.auc },
    { key: 'baseline', logLoss: baseline.logLoss, brier: baseline.brier, auc: baseline.auc },
  ];
}

export interface ReliabilityBin {
  readonly n: number;
  readonly predicted: number;
  readonly observed: number;
}

export function reliabilityBins(data: XgCv = xgCv): ReliabilityBin[] {
  return data.reliabilityGroupedCv.bins.map((bin) => ({
    n: bin.n,
    predicted: bin.meanPredicted,
    observed: bin.observedRate,
  }));
}

export interface XgTrainingFacts {
  readonly shots: number;
  readonly goals: number;
  readonly matches: number;
  readonly folds: number;
  readonly ece: number;
}

export function xgTrainingFacts(data: XgCv = xgCv): XgTrainingFacts {
  return {
    shots: data.nShots,
    goals: data.nGoals,
    matches: data.nMatches,
    folds: data.groupedCv.perFoldLogLoss.length,
    ece: data.reliabilityGroupedCv.ece,
  };
}

/** Smallest of `steps` that holds every value: an axis end a reader can hold in their head. */
export function axisCeiling(values: readonly number[], steps: readonly number[]): number {
  const peak = Math.max(0, ...values);
  return steps.find((step) => step >= peak) ?? peak;
}
