import { SIDES, type EvidenceEvent, type Side } from '../../engine';
import type { Row } from '../../lib/supabase';
import { isShotKind, toEvidence } from '../matches/weights';
import type { ShotMark } from './TimelineChart';

export type ReviewMatch = Pick<
  Row<'matches'>,
  'id' | 'opponent' | 'played_on' | 'status' | 'period_count' | 'period_minutes'
>;

export type ReviewEvent = Pick<
  Row<'match_events'>,
  'id' | 'period' | 'clock_seconds' | 'side' | 'kind' | 'weight' | 'x' | 'y'
>;

export interface ReviewPeriod {
  readonly period: number;
  readonly durationSeconds: number;
}

/**
 * Every scheduled period. Its length is the scheduled length or the last event's clock,
 * whichever is larger, so stoppage time is never cut off and an empty period still shows.
 */
export function reviewPeriods(match: ReviewMatch, events: readonly ReviewEvent[]): ReviewPeriod[] {
  const highest = Math.max(match.period_count, ...events.map((event) => event.period));
  return Array.from({ length: highest }, (_, index) => {
    const period = index + 1;
    const lastClock = Math.max(
      0,
      ...events.filter((event) => event.period === period).map((event) => event.clock_seconds),
    );
    return { period, durationSeconds: Math.max(match.period_minutes * 60, lastClock) };
  });
}

/** Goals per side, counted from `goal` events. */
export function scoreOf(events: readonly ReviewEvent[]): Record<Side, number> {
  const score: Record<Side, number> = { home: 0, away: 0 };
  for (const event of events) if (event.kind === 'goal') score[event.side] += 1;
  return score;
}

/** Stored rows as engine evidence (losing the ball in your own half favours the other side). */
export function evidenceOf(events: readonly ReviewEvent[]): EvidenceEvent[] {
  return events.map(toEvidence);
}

/** Shots of one period for the timeline, on the side of the team that took them. */
export function shotMarks(events: readonly ReviewEvent[], period: number): ShotMark[] {
  return events
    .filter((event) => event.period === period && isShotKind(event.kind))
    .map((event) => ({
      id: event.id,
      t: event.clock_seconds,
      side: event.side,
      weight: event.weight,
      goal: event.kind === 'goal',
    }));
}

export interface SideTotals {
  readonly shots: number;
  readonly goals: number;
  /** Summed chance quality in 1/10,000 units. */
  readonly chanceQuality: number;
}

/** Shots, goals and summed chance quality per side (goals are shots that went in). */
export function shotTotals(events: readonly ReviewEvent[]): Record<Side, SideTotals> {
  const result = {} as Record<Side, SideTotals>;
  for (const side of SIDES) {
    const shots = events.filter((event) => event.side === side && isShotKind(event.kind));
    result[side] = {
      shots: shots.length,
      goals: shots.filter((event) => event.kind === 'goal').length,
      chanceQuality: shots.reduce((sum, event) => sum + event.weight, 0),
    };
  }
  return result;
}

export interface MappedShot {
  readonly id: string;
  readonly side: Side;
  readonly goal: boolean;
  readonly weight: number;
  /** Metres across the pitch, 0 at the left touchline. */
  readonly across: number;
  /** Metres from the attacked goal line. */
  readonly depth: number;
}

/** Pitch the model's coordinates refer to (metres). */
export const PITCH = { length: 105, width: 68 } as const;

/**
 * Shots with a location, placed on one attacking half. Stored `x` already runs towards the
 * goal the shooting team attacked, so both teams land on the same half without flipping.
 * Shots from the own half (x below 50) cannot be drawn on it and are counted instead.
 */
export function mapShots(events: readonly ReviewEvent[]): {
  readonly shots: MappedShot[];
  readonly unplaced: number;
  readonly ownHalf: number;
} {
  const shots: MappedShot[] = [];
  let unplaced = 0;
  let ownHalf = 0;
  for (const event of events) {
    if (!isShotKind(event.kind)) continue;
    if (event.x === null || event.y === null) {
      unplaced += 1;
    } else if (event.x < 50) {
      ownHalf += 1;
    } else {
      shots.push({
        id: event.id,
        side: event.side,
        goal: event.kind === 'goal',
        weight: event.weight,
        across: (event.y / 100) * PITCH.width,
        depth: ((100 - event.x) / 100) * PITCH.length,
      });
    }
  }
  return { shots, unplaced, ownHalf };
}
