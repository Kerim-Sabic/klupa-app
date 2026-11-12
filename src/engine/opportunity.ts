import { EngineError } from './types';

/** What one player was given and what was actually observed. Counts only. */
export interface PlayerExposure {
  /** Pseudonymous roster id. The engine never needs a name or birth date. */
  readonly playerId: string;
  /** Minutes on the pitch across the period being reviewed. */
  readonly minutes: number;
  /** Observed attempts at the practised action. */
  readonly attempts: number;
  /** Observed successful attempts. */
  readonly successes: number;
}

function assertExposure(row: PlayerExposure): void {
  const whole = (value: number): boolean => Number.isSafeInteger(value) && value >= 0;
  if (!Number.isFinite(row.minutes) || row.minutes < 0) {
    throw new EngineError('INVALID_EXPOSURE', `Player ${row.playerId}: minutes must be 0 or more.`);
  }
  if (!whole(row.attempts) || !whole(row.successes) || row.successes > row.attempts) {
    throw new EngineError(
      'INVALID_EXPOSURE',
      `Player ${row.playerId}: attempts and successes must be whole numbers, successes <= attempts.`,
    );
  }
}

/**
 * Shrink an observed rate towards the group rate in proportion to how little
 * was observed. Two successes from two attempts is not a 100% player; it is a
 * player we have barely seen. `priorStrength` is the number of pseudo-attempts
 * the group rate is worth.
 */
export function shrunkRate(
  successes: number,
  attempts: number,
  priorMean: number,
  priorStrength: number,
): number {
  if (priorMean < 0 || priorMean > 1 || !(priorStrength > 0)) {
    throw new EngineError('INVALID_EXPOSURE', 'Prior mean must be in [0, 1] and strength above 0.');
  }
  return (successes + priorMean * priorStrength) / (attempts + priorStrength);
}

/**
 * Gini coefficient of a non-negative distribution: 0 means everyone got the
 * same, values near 1 mean a few players got almost everything.
 */
export function gini(values: readonly number[]): number {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (values.length === 0 || total === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const weighted = sorted.reduce((sum, value, index) => sum + (index + 1) * value, 0);
  const n = sorted.length;
  return (2 * weighted) / (n * total) - (n + 1) / n;
}

export interface OpportunityRow extends PlayerExposure {
  /** Share of all minutes this player received. */
  readonly minutesShare: number;
  /** Minutes below (positive) or above (negative) an equal share. */
  readonly minutesDebt: number;
  /** Observed success rate, or null when nothing was observed. */
  readonly rawRate: number | null;
  /** Rate after shrinkage towards the group rate. */
  readonly shrunkRate: number;
  /** Too few attempts to say anything about this player yet. */
  readonly underObserved: boolean;
}

export interface OpportunityReport {
  readonly rows: readonly OpportunityRow[];
  readonly groupRate: number;
  readonly minutesGini: number;
  readonly attemptsGini: number;
  /**
   * Players to watch next, least-observed first. This is a list of who has not
   * had a fair look yet. It is never a ranking of ability.
   */
  readonly secondLook: readonly string[];
}

export interface OpportunityOptions {
  /** Pseudo-attempts the group rate is worth. Default 10, as in the research. */
  readonly priorStrength?: number;
  /** Attempts below which a player counts as under-observed. Default 5. */
  readonly minAttempts?: number;
}

/**
 * Build the opportunity ledger for a squad: who played, who was observed, and
 * who is owed a second look before anyone draws a conclusion about them.
 */
export function buildOpportunityReport(
  squad: readonly PlayerExposure[],
  options: OpportunityOptions = {},
): OpportunityReport {
  const priorStrength = options.priorStrength ?? 10;
  const minAttempts = options.minAttempts ?? 5;
  squad.forEach(assertExposure);

  const totalMinutes = squad.reduce((sum, row) => sum + row.minutes, 0);
  const totalAttempts = squad.reduce((sum, row) => sum + row.attempts, 0);
  const totalSuccesses = squad.reduce((sum, row) => sum + row.successes, 0);
  const groupRate = totalAttempts === 0 ? 0 : totalSuccesses / totalAttempts;
  const equalMinutes = squad.length === 0 ? 0 : totalMinutes / squad.length;

  const rows: OpportunityRow[] = squad.map((row) => ({
    ...row,
    minutesShare: totalMinutes === 0 ? 0 : row.minutes / totalMinutes,
    minutesDebt: equalMinutes - row.minutes,
    rawRate: row.attempts === 0 ? null : row.successes / row.attempts,
    shrunkRate: shrunkRate(row.successes, row.attempts, groupRate, priorStrength),
    underObserved: row.attempts < minAttempts,
  }));

  const secondLook = rows
    .filter((row) => row.underObserved)
    .sort(
      (a, b) =>
        a.attempts - b.attempts || a.minutes - b.minutes || a.playerId.localeCompare(b.playerId),
    )
    .map((row) => row.playerId);

  return {
    rows,
    groupRate,
    minutesGini: gini(squad.map((row) => row.minutes)),
    attemptsGini: gini(squad.map((row) => row.attempts)),
    secondLook,
  };
}
