import { xgUnits } from '../../engine/xg';
import type { Enums } from '../../lib/supabase';
import {
  int,
  pick,
  shiftDate,
  shuffle,
  uuid,
  weighted,
  type Rng,
  type Weighted,
} from './seedRandom';
import type { SeedEvent, SeedMatch, SeedStint } from './seedTypes';

type EventKind = Enums['event_kind'];

export const PERIOD_COUNT = 2;
export const PERIOD_MINUTES = 30;
const PERIOD_SECONDS = PERIOD_MINUTES * 60;
/** A nine-a-side match, so a squad of fourteen has a real bench. */
const PITCH_SIZE = 9;

/** The eleven players who take turns on the pitch; the other three barely play. */
export const REGULARS: readonly number[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

interface Extra {
  readonly player: number;
  readonly period: number;
  readonly onSeconds: number;
}

interface MatchPlan {
  readonly opponent: string;
  /** Days before the Monday of the current week; matches fall on the Saturdays before it. */
  readonly daysBeforeMonday: number;
  readonly extras: readonly Extra[];
}

/*
 * Oldest first. Players 11 and 12 get a short cameo each; player 13 never plays. Their totals
 * (12, 8 and 0 minutes) are the finding the fairness screen is meant to show.
 */
const MATCH_PLANS: readonly MatchPlan[] = [
  {
    opponent: 'Planinari U13',
    daysBeforeMonday: 16,
    extras: [{ player: 11, period: 2, onSeconds: 1440 }],
  },
  {
    opponent: 'Riječani U13',
    daysBeforeMonday: 9,
    extras: [{ player: 12, period: 2, onSeconds: 1320 }],
  },
  {
    opponent: 'Gradski U13',
    daysBeforeMonday: 2,
    extras: [{ player: 11, period: 1, onSeconds: 1440 }],
  },
];

/** Event mix; the weights below match what the matches feature assigns to tagged chances. */
const KIND_MIX: Weighted<EventKind> = [
  ['goal', 8],
  ['shot_on_target', 14],
  ['shot_off_target', 14],
  ['big_chance', 6],
  ['box_entry', 20],
  ['corner', 10],
  ['high_recovery', 14],
  ['lost_ball_own_half', 14],
];

const FIXED_WEIGHT: Partial<Record<EventKind, number>> = {
  big_chance: 3500,
  box_entry: 300,
  corner: 250,
  high_recovery: 150,
  lost_ball_own_half: 150,
};

/** A shot the coach did not place on the pitch. */
const SHOT_WITHOUT_LOCATION = 700;

/** Two substitutions per half among the regulars, then a short cameo for a bench player. */
function periodStints(rng: Rng, period: number, extras: readonly Extra[]): SeedStint[] {
  const stints: SeedStint[] = [];
  let onPitch = shuffle(rng, REGULARS)
    .slice(0, PITCH_SIZE)
    .map((player) => ({ player, since: 0 }));

  const swapOut = (incoming: (waiting: number[]) => number, at: number): void => {
    const outgoing = pick(rng, onPitch);
    stints.push({
      playerIndex: outgoing.player,
      period,
      onSeconds: outgoing.since,
      offSeconds: at,
    });
    const waiting = REGULARS.filter((p) => !onPitch.some((entry) => entry.player === p));
    const player = incoming(waiting);
    onPitch = onPitch.map((entry) => (entry === outgoing ? { player, since: at } : entry));
  };

  for (const at of [int(rng, 540, 660), int(rng, 1140, 1260)]) {
    swapOut((waiting) => pick(rng, waiting), at);
  }
  for (const extra of extras.filter((candidate) => candidate.period === period)) {
    swapOut(() => extra.player, extra.onSeconds);
  }
  for (const entry of onPitch) {
    stints.push({
      playerIndex: entry.player,
      period,
      onSeconds: entry.since,
      offSeconds: PERIOD_SECONDS,
    });
  }
  return stints;
}

function onPitchAt(stints: readonly SeedStint[], period: number, clock: number): number[] {
  return stints
    .filter((s) => s.period === period && s.onSeconds <= clock && clock < s.offSeconds)
    .map((s) => s.playerIndex);
}

/** Inside the attacking third, biased towards the middle like real shots. */
function shotPlace(rng: Rng): { x: number; y: number } {
  return { x: int(rng, 70, 96), y: 50 + Math.round((rng() + rng() - 1) * 30) };
}

function buildEvent(
  rng: Rng,
  period: number,
  clockSeconds: number,
  stints: readonly SeedStint[],
): SeedEvent {
  const kind = weighted(rng, KIND_MIX);
  const side: Enums['event_side'] = rng() < 0.58 ? 'home' : 'away';
  const isShot = kind === 'goal' || kind === 'shot_on_target' || kind === 'shot_off_target';
  // Goals are always placed; other shots are placed four times in five.
  const placed = isShot && (kind === 'goal' || rng() < 0.8);
  const place = placed ? shotPlace(rng) : null;
  const header = placed && rng() < 0.15;
  const weight =
    place === null
      ? (FIXED_WEIGHT[kind] ?? SHOT_WITHOUT_LOCATION)
      : xgUnits({ x: place.x, y: place.y, header, freeKick: false });
  return {
    clientId: uuid(rng),
    period,
    clockSeconds,
    side,
    kind,
    weight,
    playerIndex: side === 'home' ? pick(rng, onPitchAt(stints, period, clockSeconds)) : null,
    x: place?.x ?? null,
    y: place?.y ?? null,
    header,
  };
}

function buildMatch(rng: Rng, plan: MatchPlan, monday: string): SeedMatch {
  const periods = Array.from({ length: PERIOD_COUNT }, (_, index) => index + 1);
  const stints = periods.flatMap((period) => periodStints(rng, period, plan.extras));
  const total = int(rng, 25, 40);
  const firstHalf = Math.floor(total / 2) + int(rng, -2, 2);
  const events = periods.flatMap((period) => {
    const count = period === 1 ? firstHalf : total - firstHalf;
    return Array.from({ length: count }, () => int(rng, 15, PERIOD_SECONDS - 15))
      .sort((a, b) => a - b)
      .map((clock) => buildEvent(rng, period, clock, stints));
  });
  return {
    opponent: plan.opponent,
    playedOn: shiftDate(monday, -plan.daysBeforeMonday),
    periodCount: PERIOD_COUNT,
    periodMinutes: PERIOD_MINUTES,
    events,
    stints: stints.sort((a, b) => a.period - b.period || a.onSeconds - b.onSeconds),
  };
}

/** Three finished matches, one on each of the last three Saturdays. */
export function buildMatches(rng: Rng, monday: string): SeedMatch[] {
  return MATCH_PLANS.map((plan) => buildMatch(rng, plan, monday));
}
