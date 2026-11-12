import { shotUnits } from './frame';
import { otherTeam, type ProEvent, type ProMatch, type TeamIndex } from './schema';
import type { Pair } from './stats';

/** Where each period starts on the match clock, and how long it is scheduled to last. */
const PERIOD_START_MINUTE: Readonly<Record<number, number>> = { 1: 0, 2: 45, 3: 90, 4: 105 };
const PERIOD_MINUTES: Readonly<Record<number, number>> = { 1: 45, 2: 45, 3: 15, 4: 15 };

export interface MatchMinute {
  /** The minute as football writes it: 1 for the first minute, capped at the period's end. */
  readonly minute: number;
  /** Minutes into stoppage time, 0 when inside the scheduled period. */
  readonly stoppage: number;
  /** "17", "45+2", "90+4". */
  readonly label: string;
}

/** The match minute of a moment: periods start at 0, 45, 90 and 105; stoppage is "45+2". */
export function matchMinute(period: number, t: number): MatchMinute {
  const start = PERIOD_START_MINUTE[period] ?? 0;
  const length = PERIOD_MINUTES[period] ?? 45;
  const into = Math.floor(Math.max(t, 0) / 60) + 1;
  const stoppage = Math.max(into - length, 0);
  const minute = start + Math.min(into, length);
  return {
    minute,
    stoppage,
    label: stoppage > 0 ? `${String(minute)}+${String(stoppage)}` : String(minute),
  };
}

/** The period lengths laid end to end: where each period starts on one continuous axis. */
export interface PeriodSpan {
  readonly period: number;
  /** Seconds from kick-off on the continuous axis. */
  readonly from: number;
  readonly to: number;
  /** The scheduled clock minute at the period's start (0, 45, 90, 105). */
  readonly startMinute: number;
}

export function periodSpans(match: Pick<ProMatch, 'periods'>): PeriodSpan[] {
  let from = 0;
  return match.periods.map(({ period, seconds }) => {
    const span = {
      period,
      from,
      to: from + seconds,
      startMinute: PERIOD_START_MINUTE[period] ?? 0,
    };
    from = span.to;
    return span;
  });
}

/** One step of the chance-quality race: both running totals after a shot. */
export interface RaceStep {
  /** Seconds on the continuous axis of `periodSpans`. */
  readonly elapsed: number;
  readonly period: number;
  readonly t: number;
  /** Running totals in 1/10,000 of a goal. */
  readonly units: Pair<number>;
  /** The shot that made this step, or null for the opening and closing steps. */
  readonly shot: {
    readonly index: number;
    readonly team: TeamIndex;
    readonly units: number;
    readonly goal: boolean;
  } | null;
}

/** The cumulative chance quality of both teams, one step per shot, from kick-off to the end. */
export function chanceRace(match: Pick<ProMatch, 'periods' | 'events'>): RaceStep[] {
  const spans = periodSpans(match);
  const offset = new Map(spans.map((span) => [span.period, span.from]));
  const last = spans[spans.length - 1];
  const totals: [number, number] = [0, 0];
  const steps: RaceStep[] = [{ elapsed: 0, period: 1, t: 0, units: [0, 0], shot: null }];
  for (const event of match.events) {
    if (event.kind !== 'shot') continue;
    const units = shotUnits(event);
    totals[event.team] += units;
    steps.push({
      elapsed: (offset.get(event.period) ?? 0) + event.t,
      period: event.period,
      t: event.t,
      units: [totals[0], totals[1]],
      shot: { index: event.index, team: event.team, units, goal: event.goal },
    });
  }
  steps.push({
    elapsed: last?.to ?? 0,
    period: last?.period ?? 1,
    t: last === undefined ? 0 : last.to - last.from,
    units: [totals[0], totals[1]],
    shot: null,
  });
  return steps;
}

export interface Goal {
  /** Index of the scoring event (the shot, or the own goal). */
  readonly index: number;
  /** The team the goal counts for. */
  readonly team: TeamIndex;
  readonly period: number;
  readonly t: number;
  readonly minute: MatchMinute;
  /** The player who put the ball in: for an own goal, a player of the other team. */
  readonly scorer: string | null;
  readonly assist: string | null;
  readonly penalty: boolean;
  readonly ownGoal: boolean;
}

function nameOf(match: Pick<ProMatch, 'players'>, player: number): string | null {
  return match.players[player]?.name ?? null;
}

/** How far back an assist tag is looked for. */
export const ASSIST_WINDOW_SECONDS = 20;

/**
 * The event carrying the provider's assist tag for a goal: the scoring team's latest earlier
 * event in the same move. The provider writes the other team's duels and the keeper's dive
 * between the pass and the shot, so those are stepped over; a touch on the ball by the other
 * team, a new period or twenty seconds ends the search.
 */
function assistFor(events: readonly ProEvent[], position: number): ProEvent | undefined {
  const shot = events[position];
  if (shot === undefined) return undefined;
  for (let back = position - 1; back >= 0; back -= 1) {
    const event = events[back];
    if (event === undefined || event.period !== shot.period) return undefined;
    if (shot.t - event.t > ASSIST_WINDOW_SECONDS) return undefined;
    if (event.team === shot.team) {
      if (event.assist) return event;
    } else if (event.kind !== 'duel' && event.kind !== 'save' && event.kind !== 'foul') {
      return undefined;
    }
  }
  return undefined;
}

/**
 * Every goal in order, credited to the team it counts for. The assist is read from the
 * provider's assist tag only (see `assistFor`); nothing is inferred beyond that.
 */
export function goals(match: Pick<ProMatch, 'players' | 'events'>): Goal[] {
  const list: Goal[] = [];
  match.events.forEach((event: ProEvent, position) => {
    const scored = event.kind === 'shot' && event.goal;
    if (!scored && !event.ownGoal) return;
    const team = event.ownGoal ? otherTeam(event.team) : event.team;
    const assisted = scored ? assistFor(match.events, position) : undefined;
    list.push({
      index: event.index,
      team,
      period: event.period,
      t: event.t,
      minute: matchMinute(event.period, event.t),
      scorer: nameOf(match, event.player),
      assist: assisted === undefined ? null : nameOf(match, assisted.player),
      penalty: scored && event.penalty,
      ownGoal: event.ownGoal,
    });
  });
  return list;
}
