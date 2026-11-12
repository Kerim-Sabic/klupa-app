import { EMPTY_TALLY, EXPECTED, type AttendanceValue, type Tally } from './tally';

export interface SummaryInput {
  readonly playerIds: readonly string[];
  readonly attendance: ReadonlyMap<string, AttendanceValue>;
  readonly tallies: ReadonlyMap<string, Tally>;
}

export interface SessionSummaryNumbers {
  readonly present: number;
  readonly expected: number;
  /** Mean effort among present players who were rated, or null when nobody was. One decimal. */
  readonly averageEffort: number | null;
  readonly ratedCount: number;
  readonly totalAttempts: number;
  /** Present players with no attempt counted yet: the ones the coach has not looked at. */
  readonly notObserved: number;
}

/**
 * The strip above the list. Only players who are present count towards effort and attempts:
 * counters left behind by someone later marked absent stay stored but are not summed.
 */
export function summarize({ playerIds, attendance, tallies }: SummaryInput): SessionSummaryNumbers {
  const present = playerIds.filter((id) => (attendance.get(id) ?? EXPECTED).status === 'present');
  const ratings = present.flatMap((id) => {
    const rpe = (attendance.get(id) ?? EXPECTED).rpe;
    return rpe === null ? [] : [rpe];
  });
  const attempts = present.map((id) => (tallies.get(id) ?? EMPTY_TALLY).attempts);
  const mean =
    ratings.length === 0 ? null : ratings.reduce((sum, rpe) => sum + rpe, 0) / ratings.length;
  return {
    present: present.length,
    expected: playerIds.length,
    averageEffort: mean === null ? null : Math.round(mean * 10) / 10,
    ratedCount: ratings.length,
    totalAttempts: attempts.reduce((sum, count) => sum + count, 0),
    notObserved: attempts.filter((count) => count === 0).length,
  };
}
