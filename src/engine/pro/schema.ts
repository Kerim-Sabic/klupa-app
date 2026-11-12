import { z } from 'zod';

/*
 * The pro match files, as research/pro/CONTRACT.md defines them. Every file is validated on the
 * way in; a malformed file is refused with a message that names the first thing wrong, so a
 * screen can never draw numbers from a file it did not understand.
 */

/** `0` home, `1` away, exactly as the provider's match record says. */
export type TeamIndex = 0 | 1;

export function otherTeam(team: TeamIndex): TeamIndex {
  return team === 0 ? 1 : 0;
}

/** Event kinds in contract order: the integer in the file is the index in this list. */
export const PRO_KINDS = [
  'pass',
  'shot',
  'duel',
  'setPiece',
  'onBall',
  'foul',
  'save',
  'offside',
] as const;
export type ProKind = (typeof PRO_KINDS)[number];

/** The flag bits, by name. `accurate` means on target for a shot and won for a duel. */
export const FLAG_BITS = {
  accurate: 1,
  goal: 2,
  header: 4,
  freeKick: 8,
  penalty: 16,
  cross: 32,
  corner: 64,
  keyPass: 128,
  assist: 256,
  ownGoal: 512,
  counter: 1024,
  throwIn: 2048,
  goalKick: 4096,
  interception: 8192,
} as const;
export type FlagName = keyof typeof FLAG_BITS;
export type ProFlags = Readonly<Record<FlagName, boolean>>;

/** A pitch position in percent (0-100), in the acting team's own frame unless said otherwise. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface ProEvent extends ProFlags {
  /** Position in the match's event list: a stable id. */
  readonly index: number;
  readonly period: number;
  /** Whole seconds since the start of the period. */
  readonly t: number;
  readonly team: TeamIndex;
  /** Index into `players`, or -1 when the provider names nobody. */
  readonly player: number;
  readonly kind: ProKind;
  /** Where the action happened, or null when the provider gives no position. */
  readonly at: Point | null;
  /** Where it ended (a pass's destination), or null. */
  readonly end: Point | null;
}

const int = z.number().int();
const coordinate = int.min(-1).max(100);

export const proIndexSchema = z.object({
  v: z.literal(1),
  source: z.object({ name: z.string().min(1), licence: z.string().min(1), doi: z.string().min(1) }),
  competitions: z.array(z.object({ id: z.string().min(1), name: z.string().min(1) })).min(1),
  matches: z.array(
    z.object({
      id: int.positive(),
      competition: z.string().min(1),
      date: z.iso.date(),
      stage: z.string().min(1),
      home: z.string().min(1),
      away: z.string().min(1),
      score: z.tuple([int.nonnegative(), int.nonnegative()]),
      extraTime: z.boolean(),
      shootout: z.tuple([int.nonnegative(), int.nonnegative()]).nullable(),
      events: int.nonnegative(),
    }),
  ),
});

export type ProIndex = z.infer<typeof proIndexSchema>;
export type ProMatchSummary = ProIndex['matches'][number];

const eventTuple = z.tuple([
  int.min(1).max(4),
  int.nonnegative(),
  z.union([z.literal(0), z.literal(1)]),
  int.min(-1),
  int.min(0).max(PRO_KINDS.length - 1),
  coordinate,
  coordinate,
  coordinate,
  coordinate,
  int.nonnegative(),
]);

const team = z.object({
  name: z.string().min(1),
  score: int.nonnegative(),
  formation: z.string().nullable(),
});

const matchFileSchema = z.object({
  v: z.literal(1),
  id: int.positive(),
  competition: z.string().min(1),
  date: z.iso.date(),
  stage: z.string().min(1),
  venue: z.string(),
  teams: z.tuple([team, team]),
  shootout: z.tuple([int.nonnegative(), int.nonnegative()]).nullable(),
  periods: z
    .array(z.object({ period: int.min(1).max(4), seconds: int.nonnegative() }))
    .min(1)
    .max(4),
  players: z.array(
    z.object({
      name: z.string().min(1),
      team: z.union([z.literal(0), z.literal(1)]),
      role: z.enum(['GK', 'DF', 'MF', 'FW']),
      starter: z.boolean(),
      from: int.nonnegative(),
      to: int.nonnegative(),
    }),
  ),
  events: z.array(eventTuple),
});

type MatchFile = z.infer<typeof matchFileSchema>;
export type ProPlayer = MatchFile['players'][number];
export type ProTeam = MatchFile['teams'][number];

export interface ProMatch extends Omit<MatchFile, 'events'> {
  readonly events: readonly ProEvent[];
}

function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  if (issue === undefined) return 'unknown problem';
  const path = issue.path.map(String).join('.');
  return path === '' ? issue.message : `${path}: ${issue.message}`;
}

export class ProDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProDataError';
  }
}

function point(x: number, y: number): Point | null {
  return x < 0 || y < 0 ? null : { x, y };
}

/** One event tuple as a readonly object with named flags. */
export function decodeEvent(tuple: z.infer<typeof eventTuple>, index: number): ProEvent {
  const [period, t, teamIndex, player, kind, x, y, x2, y2, flags] = tuple;
  const named = Object.fromEntries(
    Object.entries(FLAG_BITS).map(([name, bit]) => [name, (flags & bit) !== 0]),
  ) as Record<FlagName, boolean>;
  return Object.freeze({
    index,
    period,
    t,
    team: teamIndex,
    player,
    kind: PRO_KINDS[kind] ?? 'pass',
    at: point(x, y),
    end: point(x2, y2),
    ...named,
  });
}

/** The list of matches. Throws `ProDataError` when the file does not follow the contract. */
export function parseProIndex(input: unknown): ProIndex {
  const result = proIndexSchema.safeParse(input);
  if (!result.success) {
    throw new ProDataError(
      `Match list is not in the expected format (${firstIssue(result.error)}).`,
    );
  }
  return result.data;
}

/** One match with decoded events. Throws `ProDataError` when the file does not follow the contract. */
export function parseProMatch(input: unknown): ProMatch {
  const result = matchFileSchema.safeParse(input);
  if (!result.success) {
    throw new ProDataError(
      `Match file is not in the expected format (${firstIssue(result.error)}).`,
    );
  }
  const file = result.data;
  const badPlayer = file.events.findIndex(
    (event) =>
      event[3] >= file.players.length ||
      (event[3] >= 0 && file.players[event[3]]?.team !== event[2]),
  );
  if (badPlayer >= 0) {
    throw new ProDataError(
      `Match file is not in the expected format (events.${String(badPlayer)}: player does not belong to that team).`,
    );
  }
  return { ...file, events: file.events.map(decodeEvent) };
}
