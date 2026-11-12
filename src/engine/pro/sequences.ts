import { toCommon } from './frame';
import { goals, type Goal } from './timeline';
import { type Point, type ProEvent, type ProKind, type ProMatch } from './schema';

export const SEQUENCE_MAX_EVENTS = 10;
export const SEQUENCE_MAX_SECONDS = 40;

/** Kinds that mean the team had the ball: one of these by the other side ends the chain. */
const ON_BALL: ReadonlySet<ProKind> = new Set<ProKind>(['pass', 'shot', 'setPiece', 'onBall']);

export interface SequenceStep {
  readonly index: number;
  readonly kind: ProKind;
  readonly player: string | null;
  readonly t: number;
  /** Start and end in the common frame (home attacks left to right). */
  readonly from: Point;
  readonly to: Point;
  readonly cross: boolean;
  readonly header: boolean;
}

export interface GoalSequence {
  readonly goal: Goal;
  /** Oldest first; the last step is the finish (shot, or the own goal into its own net). */
  readonly steps: readonly SequenceStep[];
}

/** Where the ball ended: the event's end, a shot's goal mouth, or (failing those) where it began. */
function endOf(event: ProEvent, start: Point): Point {
  if (event.ownGoal) return toCommon({ x: 0, y: 50 }, event.team);
  if (event.kind === 'shot' && event.goal) return toCommon({ x: 100, y: 50 }, event.team);
  return event.end === null ? start : toCommon(event.end, event.team);
}

function stepOf(match: Pick<ProMatch, 'players'>, event: ProEvent): SequenceStep | null {
  if (event.at === null) return null;
  const from = toCommon(event.at, event.team);
  return {
    index: event.index,
    kind: event.kind,
    player: match.players[event.player]?.name ?? null,
    t: event.t,
    from,
    to: endOf(event, from),
    cross: event.cross,
    header: event.header,
  };
}

/** Whether the scoring team's chain continues back through this event. */
function belongs(event: ProEvent, goal: ProEvent, scoring: number): 'take' | 'skip' | 'stop' {
  if (event.period !== goal.period || goal.t - event.t > SEQUENCE_MAX_SECONDS) return 'stop';
  if (event.team === scoring) {
    if (ON_BALL.has(event.kind)) return 'take';
    if (event.kind === 'duel') return event.accurate ? 'take' : 'skip';
    return event.kind === 'foul' ? 'stop' : 'skip';
  }
  // The other side's duels, fouls and keeper actions happen around a move without ending it.
  return ON_BALL.has(event.kind) || event.kind === 'offside' ? 'stop' : 'skip';
}

/**
 * For each goal, the scoring team's own events that led to it: walk back from the goal through
 * that team's actions until the other team had the ball, the period changed, or the cap of ten
 * events or forty seconds is reached. For an own goal the chain is the attack it ended, then the
 * own goal itself.
 */
export function goalSequences(match: Pick<ProMatch, 'players' | 'events'>): GoalSequence[] {
  return goals(match).map((goal) => {
    const at = match.events.findIndex((event) => event.index === goal.index);
    const finish = match.events[at];
    if (finish === undefined) return { goal, steps: [] };
    const scoring = goal.team;
    const chain: SequenceStep[] = [];
    const last = stepOf(match, finish);
    let budget = SEQUENCE_MAX_EVENTS - (last === null ? 0 : 1);
    for (let position = at - 1; position >= 0 && budget > 0; position -= 1) {
      const event = match.events[position];
      if (event === undefined) break;
      const verdict = belongs(event, finish, scoring);
      if (verdict === 'stop') break;
      if (verdict === 'skip') continue;
      const step = stepOf(match, event);
      if (step !== null) {
        chain.unshift(step);
        budget -= 1;
      }
    }
    if (last !== null) chain.push(last);
    return { goal, steps: chain };
  });
}
