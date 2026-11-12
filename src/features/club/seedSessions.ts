import { DRILLS, FOCUS_KEYS, PITCH_AREAS, type Drill, type DrillPhase } from '../../data/drills';
import { at, daysSinceMonday, int, pick, shiftDate, shuffle, type Rng } from './seedRandom';
import type { SeedAttendance, SeedDrill, SeedObservation, SeedSession } from './seedTypes';

const SESSION_COUNT = 5;
const SQUAD_SIZE = 14;
const PHASES: readonly DrillPhase[] = ['warmup', 'main', 'game'];

/** Evening sessions under floodlights, booked on a full pitch for only nine players. */
const FLOODLIT_SESSIONS: ReadonlySet<number> = new Set([1, 3]);
const BENCH_PLAYERS: readonly number[] = [11, 12, 13];
/** Everyone who may miss a session: not the jumper, and not the bench (who miss one night). */
const REGULAR_ABSENTEES: readonly number[] = [0, 1, 2, 4, 5, 6, 7, 8, 9, 10];

/*
 * Player 3 is the one whose load jumps: easy sessions at first, then a hard one this week.
 * Everyone else keeps one steady effort rating, so the jump is the only sharp increase.
 */
const JUMPER = 3;
const JUMPER_RPE: readonly number[] = [3, 4, 4, 3, 8];

/** How many attempts each player is watched for over the season: [fewest, most]. */
const WATCHED: readonly (readonly [number, number])[] = [
  ...Array.from({ length: 8 }, (): readonly [number, number] => [15, 25]),
  ...Array.from({ length: 3 }, (): readonly [number, number] => [6, 12]),
  [2, 3],
  [1, 2],
  [0, 0],
];

function pickDrill(rng: Rng, phase: DrillPhase, focus: string, players: number): Drill {
  const fitting = DRILLS.filter(
    (drill) =>
      drill.phase === phase &&
      drill.ageGroups.includes('u13') &&
      drill.minPlayers <= players &&
      players <= drill.maxPlayers,
  );
  const focused = fitting.filter((drill) => drill.focus.some((key) => key === focus));
  return pick(rng, focused.length > 0 ? focused : fitting);
}

/** The biggest space any of the drills needs. */
function areaFor(drills: readonly Drill[]): SeedSession['area'] {
  return at(PITCH_AREAS, Math.max(...drills.map((drill) => PITCH_AREAS.indexOf(drill.minArea))));
}

interface Outline {
  readonly heldOn: string;
  readonly focus: string;
  readonly drills: readonly SeedDrill[];
  readonly durationMinutes: number;
  readonly area: SeedSession['area'];
  readonly floodlit: boolean;
  readonly present: ReadonlySet<number>;
  readonly attendance: readonly SeedAttendance[];
  /** Filled in once every session is outlined, because totals are per player. */
  readonly observations: SeedObservation[];
}

interface Plan {
  readonly heldOn: string;
  readonly absent: readonly number[];
}

function outlineSession(
  rng: Rng,
  index: number,
  plan: Plan,
  focus: string,
  ratings: readonly number[],
): Outline {
  const floodlit = FLOODLIT_SESSIONS.has(index);
  const absent = new Set(plan.absent);
  const everyone = ratings.map((_, player) => player);
  const present = new Set(everyone.filter((player) => !absent.has(player)));
  const picked = PHASES.map((phase) => pickDrill(rng, phase, focus, present.size));
  const drills = picked.map((drill, position) => ({
    position: position + 1,
    drillKey: drill.key,
    minutes: drill.minutes,
  }));
  const durationMinutes = drills.reduce((sum, drill) => sum + drill.minutes, 0);
  const attendance = everyone.map((playerIndex): SeedAttendance => {
    if (!present.has(playerIndex)) {
      return { playerIndex, status: 'absent', minutes: null, rpe: null };
    }
    // Everyone present trains the whole session, so minutes and effort compare cleanly.
    const rpe = playerIndex === JUMPER ? at(JUMPER_RPE, index) : at(ratings, playerIndex);
    return { playerIndex, status: 'present', minutes: durationMinutes, rpe };
  });
  return {
    heldOn: plan.heldOn,
    focus,
    drills,
    durationMinutes,
    area: floodlit ? 'full' : areaFor(picked),
    floodlit,
    present,
    attendance,
    observations: [],
  };
}

/** Watched attempts are split across the sessions a player attended; some players are barely watched. */
function addObservations(rng: Rng, outlines: readonly Outline[]): void {
  WATCHED.forEach(([fewest, most], playerIndex) => {
    const total = int(rng, fewest, most);
    const attended = outlines.filter((outline) => outline.present.has(playerIndex));
    attended.forEach((outline, order) => {
      const attempts =
        Math.floor(total / attended.length) + (order < total % attended.length ? 1 : 0);
      if (attempts === 0) return;
      const successes = Math.min(attempts, Math.round(attempts * (0.4 + rng() * 0.4)));
      outline.observations.push({ playerIndex, skill: outline.focus, attempts, successes });
    });
  });
}

/**
 * Five completed sessions: a Tuesday and a Thursday three weeks back, a Tuesday two weeks back,
 * a Thursday last week and one this week. Every ISO week holds one session (three weeks back
 * holds two), so only the jumper's week stands out.
 */
export function buildSessions(rng: Rng, monday: string, today: string): SeedSession[] {
  const focuses = shuffle(rng, FOCUS_KEYS).slice(0, SESSION_COUNT);
  const absentees = shuffle(rng, REGULAR_ABSENTEES);
  /*
   * Nobody misses more than one of the first four sessions, because a player who skips two
   * would look like a load spike when they come back. The bench misses the first floodlit
   * night, which is how that night ends up with nine players on a full pitch.
   */
  const plans: readonly Plan[] = [
    { heldOn: shiftDate(monday, -20), absent: absentees.slice(0, 1) },
    { heldOn: shiftDate(monday, -18), absent: [...BENCH_PLAYERS, ...absentees.slice(1, 3)] },
    { heldOn: shiftDate(monday, -13), absent: absentees.slice(3, 4) },
    { heldOn: shiftDate(monday, -4), absent: absentees.slice(4, 9) },
    {
      heldOn: shiftDate(today, -Math.min(2, daysSinceMonday(today))),
      absent: absentees.slice(9, 10),
    },
  ];
  const ratings = Array.from({ length: SQUAD_SIZE }, () => int(rng, 4, 6));

  const outlines = plans.map((plan, index) =>
    outlineSession(rng, index, plan, at(focuses, index), ratings),
  );
  addObservations(rng, outlines);
  return outlines.map((outline) => ({
    heldOn: outline.heldOn,
    focus: outline.focus,
    durationMinutes: outline.durationMinutes,
    area: outline.area,
    expectedPlayers: outline.present.size,
    floodlit: outline.floodlit,
    drills: outline.drills,
    attendance: outline.attendance,
    observations: outline.observations,
  }));
}
