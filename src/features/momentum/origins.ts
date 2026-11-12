import type { Side } from '../../engine';
import { isShotKind } from '../matches/weights';
import type { ReviewEvent } from './reviewModel';

/*
 * How each side's chances came about, read from what was tagged just before each shot.
 *
 * It answers "why did they get those chances" as far as the tags allow, and no further: a shot
 * with nothing tagged in the half-minute before it is counted as "other", not guessed at. The
 * classes are the three lead-ups a coach can tag and act on in training:
 *
 *   pressing   the shooting side won the ball high up the pitch
 *   turnover   the other side lost the ball in its own half
 *   corner     the shooting side had a corner
 */

export type Origin = 'pressing' | 'turnover' | 'corner' | 'other';

/** Display order, and the order that settles two lead-ups tagged at the same second. */
export const ORIGINS: readonly Origin[] = ['pressing', 'turnover', 'corner', 'other'];

/** How far back, in match seconds, a tagged event still counts as the lead-up to a shot. */
export const ORIGIN_WINDOW_SECONDS = 30;

/** Below this many chances a "most common lead-up" would be a coincidence, so none is named. */
export const MIN_CHANCES_FOR_PATTERN = 3;

export interface OriginRow {
  readonly origin: Origin;
  readonly chances: number;
  readonly goals: number;
  /** Summed chance quality in 1/10,000 of a goal. */
  readonly units: number;
}

export interface OriginProfile {
  readonly side: Side;
  readonly chances: number;
  readonly goals: number;
  readonly units: number;
  /** One row per origin, always all four, in display order. */
  readonly rows: readonly OriginRow[];
  /** The lead-up behind at least half of the chances, when there are enough to say. */
  readonly pattern: OriginRow | null;
}

const otherSide = (side: Side): Side => (side === 'home' ? 'away' : 'home');

/** A chance is any shot, or a big chance that was tagged without a shot being taken. */
const isChance = (event: ReviewEvent): boolean =>
  isShotKind(event.kind) || event.kind === 'big_chance';

/** What a tagged event means as a lead-up for a shot by `shooter`, if anything. */
function leadUp(event: ReviewEvent, shooter: Side): Origin | null {
  if (event.side === shooter && event.kind === 'high_recovery') return 'pressing';
  if (event.side === otherSide(shooter) && event.kind === 'lost_ball_own_half') return 'turnover';
  if (event.side === shooter && event.kind === 'corner') return 'corner';
  return null;
}

/** The origin of one shot: the latest lead-up tagged in the window before it, in its period. */
export function originOf(shot: ReviewEvent, events: readonly ReviewEvent[]): Origin {
  let best: { readonly origin: Origin; readonly clock: number } | null = null;
  for (const event of events) {
    if (event.period !== shot.period || event.id === shot.id) continue;
    const gap = shot.clock_seconds - event.clock_seconds;
    if (gap < 0 || gap > ORIGIN_WINDOW_SECONDS) continue;
    const origin = leadUp(event, shot.side);
    if (origin === null) continue;
    const later = best === null || event.clock_seconds > best.clock;
    const sameSecondButFirstInOrder =
      best !== null &&
      event.clock_seconds === best.clock &&
      ORIGINS.indexOf(origin) < ORIGINS.indexOf(best.origin);
    if (later || sameSecondButFirstInOrder) best = { origin, clock: event.clock_seconds };
  }
  return best === null ? 'other' : best.origin;
}

function profileOf(side: Side, events: readonly ReviewEvent[]): OriginProfile {
  const tally: Record<Origin, { chances: number; goals: number; units: number }> = {
    pressing: { chances: 0, goals: 0, units: 0 },
    turnover: { chances: 0, goals: 0, units: 0 },
    corner: { chances: 0, goals: 0, units: 0 },
    other: { chances: 0, goals: 0, units: 0 },
  };
  for (const event of events) {
    if (event.side !== side || !isChance(event)) continue;
    const row = tally[originOf(event, events)];
    row.chances += 1;
    row.units += event.weight;
    if (event.kind === 'goal') row.goals += 1;
  }
  const rows: OriginRow[] = ORIGINS.map((origin) => ({ origin, ...tally[origin] }));
  const chances = rows.reduce((sum, row) => sum + row.chances, 0);
  // "Other" is the absence of a tagged lead-up, so it is never reported as a pattern.
  const leading = rows
    .filter((row) => row.origin !== 'other')
    .reduce<OriginRow | null>(
      (top, row) => (top === null || row.chances > top.chances ? row : top),
      null,
    );
  const pattern =
    leading !== null && chances >= MIN_CHANCES_FOR_PATTERN && leading.chances * 2 >= chances
      ? leading
      : null;
  return {
    side,
    chances,
    goals: rows.reduce((sum, row) => sum + row.goals, 0),
    units: rows.reduce((sum, row) => sum + row.units, 0),
    rows,
    pattern,
  };
}

/** Both sides' chances by lead-up. Events may be in any order. */
export function chanceOrigins(events: readonly ReviewEvent[]): Record<Side, OriginProfile> {
  return { home: profileOf('home', events), away: profileOf('away', events) };
}
