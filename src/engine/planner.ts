import {
  AGE_GROUPS,
  EQUIPMENT,
  FOCUS_KEYS,
  PITCH_AREAS,
  type AgeGroup,
  type Drill,
  type DrillPhase,
  type Equipment,
  type FocusKey,
  type PitchArea,
} from '../data/drills';

/** Stable, machine-readable failure codes for invalid planner input. */
export type PlannerErrorCode =
  | 'INVALID_PLAYERS'
  | 'INVALID_MINUTES'
  | 'UNKNOWN_FOCUS'
  | 'UNKNOWN_AREA'
  | 'UNKNOWN_AGE_GROUP'
  | 'UNKNOWN_EQUIPMENT'
  | 'INVALID_DRILL'
  | 'INVALID_ATTENDANCE'
  | 'INVALID_ROTATION';

/**
 * Thrown only for input that can never make sense (zero players, a 5-minute
 * session, an unknown focus). An unlucky but valid night returns an
 * infeasible plan instead, so the UI can explain it rather than crash.
 */
export class PlannerError extends RangeError {
  readonly code: PlannerErrorCode;

  constructor(code: PlannerErrorCode, message: string) {
    super(message);
    this.name = 'PlannerError';
    this.code = code;
  }
}

/** Bounds that catch typos (600 players, 900 minutes) without limiting real use. */
export const MAX_PLAYERS = 60;
export const MIN_SESSION_MINUTES = 10;
export const MAX_SESSION_MINUTES = 240;

export interface SessionConstraints {
  readonly focus: FocusKey;
  readonly players: number;
  readonly minutes: number;
  readonly area: PitchArea;
  readonly ageGroup: AgeGroup;
  readonly equipment: readonly Equipment[];
}

export type RejectionCode =
  'TOO_FEW_PLAYERS' | 'TOO_MANY_PLAYERS' | 'NOT_ENOUGH_SPACE' | 'AGE_GROUP' | 'MISSING_EQUIPMENT';

/** `OTHER_FOCUS` marks a warm-up or game borrowed from another focus because none fitted. */
export type BlockReason =
  'MATCHES_FOCUS' | 'OTHER_FOCUS' | 'FITS_PLAYERS' | 'FITS_SPACE' | 'MOST_REPS';

export interface RejectedDrill {
  readonly drillKey: string;
  readonly phase: DrillPhase;
  readonly reason: RejectionCode;
}

export interface SessionBlock {
  readonly phase: DrillPhase;
  readonly drillKey: string;
  readonly minutes: number;
  /** Planning estimate (rate x minutes, one decimal), never a measurement. */
  readonly expectedRepsPerPlayer: number;
  readonly reasons: readonly BlockReason[];
}

export interface SessionPlan {
  readonly feasible: boolean;
  readonly blocks: readonly SessionBlock[];
  readonly totalMinutes: number;
  readonly expectedRepsPerPlayer: number;
  /** Every drill for the chosen focus that cannot run tonight, sorted by key. */
  readonly rejected: readonly RejectedDrill[];
}

const isWhole = (value: number, min: number, max: number): boolean =>
  Number.isSafeInteger(value) && value >= min && value <= max;

const byKey = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function assertConstraints(c: SessionConstraints): void {
  if (!isWhole(c.players, 1, MAX_PLAYERS)) {
    throw new PlannerError('INVALID_PLAYERS', 'Players must be a whole number from 1 to 60.');
  }
  if (!isWhole(c.minutes, MIN_SESSION_MINUTES, MAX_SESSION_MINUTES)) {
    throw new PlannerError('INVALID_MINUTES', 'Minutes must be a whole number from 10 to 240.');
  }
  if (!FOCUS_KEYS.includes(c.focus)) throw new PlannerError('UNKNOWN_FOCUS', 'Unknown focus.');
  if (!PITCH_AREAS.includes(c.area)) throw new PlannerError('UNKNOWN_AREA', 'Unknown area.');
  if (!AGE_GROUPS.includes(c.ageGroup)) {
    throw new PlannerError('UNKNOWN_AGE_GROUP', 'Unknown age group.');
  }
  if (!c.equipment.every((item) => EQUIPMENT.includes(item))) {
    throw new PlannerError('UNKNOWN_EQUIPMENT', 'Unknown equipment item.');
  }
}

/** The library is data that may later come from storage, so it is checked, not trusted. */
function assertDrills(drills: readonly Drill[]): void {
  const seen = new Set<string>();
  for (const drill of drills) {
    const valid =
      !seen.has(drill.key) &&
      isWhole(drill.minPlayers, 1, MAX_PLAYERS) &&
      isWhole(drill.maxPlayers, drill.minPlayers, MAX_PLAYERS) &&
      isWhole(drill.minutes, 1, MAX_SESSION_MINUTES) &&
      Number.isFinite(drill.repsPerPlayerMinute) &&
      drill.repsPerPlayerMinute >= 0;
    if (!valid) throw new PlannerError('INVALID_DRILL', `Drill "${drill.key}" is malformed.`);
    seen.add(drill.key);
  }
}

/**
 * Why a drill cannot run tonight, or null when it can. Checks run in a fixed
 * order (players, space, age, equipment) so each rejection has exactly one,
 * repeatable reason.
 */
export function checkDrill(drill: Drill, c: SessionConstraints): RejectionCode | null {
  if (c.players < drill.minPlayers) return 'TOO_FEW_PLAYERS';
  if (c.players > drill.maxPlayers) return 'TOO_MANY_PLAYERS';
  if (PITCH_AREAS.indexOf(c.area) < PITCH_AREAS.indexOf(drill.minArea)) return 'NOT_ENOUGH_SPACE';
  if (!drill.ageGroups.includes(c.ageGroup)) return 'AGE_GROUP';
  if (!drill.equipment.every((item) => c.equipment.includes(item))) return 'MISSING_EQUIPMENT';
  return null;
}

/** Most expected attempts first; ties by key so the choice never depends on list order. */
const byReps = (a: Drill, b: Drill): number =>
  b.repsPerPlayerMinute - a.repsPerPlayerMinute || byKey(a.key, b.key);

interface Pick {
  readonly drill: Drill;
  readonly reasons: readonly BlockReason[];
}

/**
 * Pick up to `count` drills for a phase. Warm-ups and games may fall back to
 * another focus (the session still needs them); a main drill never does,
 * because the main drill is what makes it a session about the chosen focus.
 */
function pickPhase(feasible: readonly Drill[], focus: FocusKey, phase: DrillPhase, count: number) {
  const ofPhase = feasible.filter((d) => d.phase === phase).sort(byReps);
  const matching = ofPhase.filter((d) => d.focus.includes(focus));
  const pool = matching.length > 0 || phase === 'main' ? matching : ofPhase;
  const best = Math.max(0, ...pool.map((d) => d.repsPerPlayerMinute));
  return pool.slice(0, count).map((drill): Pick => ({
    drill,
    reasons: [
      drill.focus.includes(focus) ? 'MATCHES_FOCUS' : 'OTHER_FOCUS',
      'FITS_PLAYERS',
      'FITS_SPACE',
      ...(drill.repsPerPlayerMinute >= best ? (['MOST_REPS'] as const) : []),
    ],
  }));
}

/**
 * Split a budget into whole minutes in proportion to each weight (a drill's
 * default length). Every block gets at least one minute and the rest goes by
 * largest remainder, earlier block first on a tie, so the total equals the
 * budget exactly and never drifts over it.
 */
function spread<T>(items: readonly T[], weightOf: (item: T) => number, budget: number) {
  const weights = items.map(weightOf);
  if (weights.length === 0 || !weights.every((w) => w > 0 && Number.isFinite(w))) {
    throw new PlannerError('INVALID_MINUTES', 'Weights must be positive numbers.');
  }
  if (!isWhole(budget, weights.length, Number.MAX_SAFE_INTEGER)) {
    throw new PlannerError('INVALID_MINUTES', 'The budget must give every block a minute.');
  }
  const spare = budget - weights.length;
  const total = weights.reduce((sum, w) => sum + w, 0);
  const parts = items.map((item, i) => {
    const exact = (weightOf(item) * spare) / total;
    return { item, i, base: Math.floor(exact), frac: exact - Math.floor(exact) };
  });
  const left = spare - parts.reduce((sum, part) => sum + part.base, 0);
  const bonus = new Set(
    [...parts]
      .sort((a, b) => b.frac - a.frac || a.i - b.i)
      .slice(0, left)
      .map((part) => part.i),
  );
  return parts.map((part) => ({
    item: part.item,
    minutes: 1 + part.base + (bonus.has(part.i) ? 1 : 0),
  }));
}

/** Whole-minute split of `budget` in proportion to `weights`; sums to `budget` exactly. */
export function allocateMinutes(weights: readonly number[], budget: number): number[] {
  return spread(weights, (w) => w, budget).map((part) => part.minutes);
}

const oneDecimal = (value: number): number => Math.round(value * 10) / 10;

/**
 * Plan one session: warm-up, one or two main drills, then a game. Under 30
 * minutes there is room for one main drill; under 20 only a warm-up and a game.
 * `feasible` is false when no main drill for the focus fits tonight.
 */
export function planSession(
  drills: readonly Drill[],
  constraints: SessionConstraints,
): SessionPlan {
  assertConstraints(constraints);
  assertDrills(drills);
  const { focus, minutes } = constraints;
  const feasible = drills.filter((drill) => checkDrill(drill, constraints) === null);
  const rejected = drills
    .filter((drill) => drill.focus.includes(focus))
    .flatMap((drill): RejectedDrill[] => {
      const reason = checkDrill(drill, constraints);
      return reason === null ? [] : [{ drillKey: drill.key, phase: drill.phase, reason }];
    })
    .sort((a, b) => byKey(a.drillKey, b.drillKey));

  const mains = pickPhase(feasible, focus, 'main', 2);
  if (mains.length === 0) {
    return { feasible: false, blocks: [], totalMinutes: 0, expectedRepsPerPlayer: 0, rejected };
  }
  const warmup = pickPhase(feasible, focus, 'warmup', 1);
  const game = pickPhase(feasible, focus, 'game', 1);
  // A session with no usable warm-up or game still gets its main drill.
  const minMains = warmup.length + game.length === 0 ? 1 : 0;
  const mainCount = Math.max(minMains, minutes < 20 ? 0 : minutes < 30 ? 1 : 2);
  const picks = [...warmup, ...mains.slice(0, mainCount), ...game];
  const parts = spread(picks, (pick) => pick.drill.minutes, minutes);
  const blocks = parts.map(({ item: { drill, reasons }, minutes: blockMinutes }): SessionBlock => ({
    phase: drill.phase,
    drillKey: drill.key,
    minutes: blockMinutes,
    expectedRepsPerPlayer: oneDecimal(drill.repsPerPlayerMinute * blockMinutes),
    reasons,
  }));
  const reps = parts.reduce(
    (sum, part) => sum + part.item.drill.repsPerPlayerMinute * part.minutes,
    0,
  );
  return {
    feasible: true,
    blocks,
    totalMinutes: blocks.reduce((sum, block) => sum + block.minutes, 0),
    expectedRepsPerPlayer: oneDecimal(reps),
    rejected,
  };
}

export interface AttendanceScenario {
  readonly players: number;
  readonly plan: SessionPlan;
}

/** With `players` (down to the next switch point) the main drill changes from `from` to `to`. */
export interface SwitchPoint {
  readonly players: number;
  readonly from: string | null;
  readonly to: string | null;
}

export interface AttendancePlan {
  /** One scenario per distinct player count, most players first. */
  readonly scenarios: readonly AttendanceScenario[];
  readonly switchPoints: readonly SwitchPoint[];
}

const mainKey = (plan: SessionPlan): string | null =>
  plan.blocks.find((block) => block.phase === 'main')?.drillKey ?? null;

/**
 * Plan the same session for several possible turnouts so a coach knows before
 * the night what changes if fewer players come. `constraints.players` is
 * ignored; each count in `playerCounts` is planned instead. A plan without a
 * main block (under 20 minutes, or infeasible) counts as main drill `null`.
 */
export function planForAttendance(
  drills: readonly Drill[],
  constraints: SessionConstraints,
  playerCounts: readonly number[],
): AttendancePlan {
  if (playerCounts.length === 0) {
    throw new PlannerError('INVALID_ATTENDANCE', 'Give at least one player count.');
  }
  const counts = [...new Set(playerCounts)].sort((a, b) => b - a);
  const scenarios = counts.map((players) => ({
    players,
    plan: planSession(drills, { ...constraints, players }),
  }));
  const switchPoints: SwitchPoint[] = [];
  let previous: string | null = null;
  scenarios.forEach((scenario, i) => {
    const current = mainKey(scenario.plan);
    if (i > 0 && current !== previous) {
      switchPoints.push({ players: scenario.players, from: previous, to: current });
    }
    previous = current;
  });
  return { scenarios, switchPoints };
}

export interface RotationOptions {
  readonly rounds: number;
  /** Players doing the practised role at once; capped at the squad size. */
  readonly slotsPerRound: number;
  /** Players owed a fair look; served first, in the order given. */
  readonly priority?: readonly string[];
}

export interface PlayerTurns {
  readonly playerId: string;
  readonly turns: number;
}

export interface Rotation {
  /** Player ids in the practised role, one array per round. */
  readonly rounds: readonly (readonly string[])[];
  /** Turn count per player, in the order of `playerIds`. */
  readonly turns: readonly PlayerTurns[];
}

/**
 * Share turns in the practised role. Players are queued priority first, then
 * everyone else in the given order, and each round takes the next players
 * from that queue, wrapping round. Walking one queue is what guarantees turn
 * counts differ by at most one and that any extra turn lands on a priority
 * player before anyone else.
 */
export function buildRotation(playerIds: readonly string[], options: RotationOptions): Rotation {
  const { rounds, slotsPerRound, priority = [] } = options;
  const ids = new Set(playerIds);
  const prioritySet = new Set(priority);
  if (playerIds.length === 0 || ids.size !== playerIds.length || ids.has('')) {
    throw new PlannerError('INVALID_ROTATION', 'Player ids must be non-empty and unique.');
  }
  if (prioritySet.size !== priority.length || !priority.every((id) => ids.has(id))) {
    throw new PlannerError('INVALID_ROTATION', 'Priority ids must be unique squad members.');
  }
  if (!isWhole(rounds, 1, 1000) || !isWhole(slotsPerRound, 1, 1000)) {
    throw new PlannerError('INVALID_ROTATION', 'Rounds and slots must be whole numbers 1-1000.');
  }
  const queue = [...priority, ...playerIds.filter((id) => !prioritySet.has(id))];
  const slots = Math.min(slotsPerRound, queue.length);
  const counts = new Map<string, number>();
  const assigned = Array.from({ length: rounds }, (_, round) => {
    const start = (round * slots) % queue.length;
    const picked = [...queue.slice(start), ...queue.slice(0, start)].slice(0, slots);
    picked.forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1));
    return picked;
  });
  return {
    rounds: assigned,
    turns: playerIds.map((playerId) => ({ playerId, turns: counts.get(playerId) ?? 0 })),
  };
}
