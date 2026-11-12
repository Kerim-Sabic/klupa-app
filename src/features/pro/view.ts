import type { ReviewEvent } from '../momentum/reviewModel';
import { formatPercent, formatXg } from '../momentum/chartModel';
import {
  chanceRace,
  eventPlayhead,
  eventsUntil,
  goals,
  momentAt,
  playerLines,
  scoreOfEvents,
  teamStats,
  type ClockMoment,
  type Goal,
  type MatchClock,
  type Pair,
  type PlayerLine,
  type ProEvent,
  type ProMatch,
  type RaceStep,
  type TeamStats,
} from '../../engine/pro';
import { toReview } from './toReview';

/*
 * Everything the match screen shows, as a pure function of the match and the playhead. At full
 * time it is the finished analysis; earlier it is exactly what had happened by then.
 */
export interface MatchView {
  readonly playhead: number;
  readonly fullTime: boolean;
  readonly moment: ClockMoment;
  readonly events: readonly ProEvent[];
  readonly score: Pair<number>;
  readonly stats: Pair<TeamStats>;
  readonly goals: readonly Goal[];
  /** Every event as the coach's taps (own goals included, for the score). */
  readonly review: readonly ReviewEvent[];
  /** The same without own goals: the chances, for the shot map. */
  readonly chances: readonly ReviewEvent[];
  readonly race: readonly RaceStep[];
  readonly players: readonly PlayerLine[];
}

/** The race up to the playhead: the closing step sits at the playhead, not at the final whistle. */
export function raceUntil(
  match: Pick<ProMatch, 'periods'>,
  events: readonly ProEvent[],
  playhead: number,
): RaceStep[] {
  const race = chanceRace({ periods: match.periods, events });
  const last = race[race.length - 1];
  if (last === undefined) return race;
  return [
    ...race.slice(0, -1),
    { ...last, elapsed: Math.min(last.elapsed, Math.max(playhead, 0)) },
  ];
}

/** The team with more touches in a territory cell and its share of them (home on a tie). */
export function cellLead(
  touches: Pair<number>,
): { readonly team: 0 | 1; readonly value: number } | null {
  const total = touches[0] + touches[1];
  if (total === 0) return null;
  return touches[0] >= touches[1]
    ? { team: 0, value: touches[0] / total }
    : { team: 1, value: touches[1] / total };
}

/** Both running totals at a moment: the last step at or before it. */
export function raceValueAt(race: readonly RaceStep[], elapsed: number): Pair<number> {
  let value: Pair<number> = [0, 0];
  for (const step of race) {
    if (step.elapsed > elapsed) break;
    value = step.units;
  }
  return value;
}

/**
 * Players as they stood at the playhead: nobody who had not come on yet, and minutes counted
 * only up to the current minute.
 */
export function playersAt(
  lines: readonly PlayerLine[],
  minute: number,
  fullTime: boolean,
): PlayerLine[] {
  if (fullTime) return [...lines];
  return lines
    .filter((line) => line.from <= minute)
    .map((line) => ({ ...line, minutes: Math.max(Math.min(line.to, minute) - line.from, 0) }));
}

export function matchView(match: ProMatch, clock: MatchClock, playhead: number): MatchView {
  const events = eventsUntil(match, playhead, clock);
  const fullTime = playhead >= clock.total;
  const moment = momentAt(clock, playhead);
  const slice = { events };
  return {
    playhead,
    fullTime,
    moment,
    events,
    score: scoreOfEvents(events),
    stats: teamStats(slice),
    goals: goals({ players: match.players, events }),
    review: toReview(slice),
    chances: toReview(slice, { ownGoals: false }),
    race: raceUntil(match, events, playhead),
    players: playersAt(
      playerLines({ players: match.players, events }),
      moment.minute.minute + moment.minute.stoppage,
      fullTime,
    ),
  };
}

/** Where each goal sits on the playhead axis, for scrubber ticks and live announcements. */
export function goalPlayheads(match: ProMatch, clock: MatchClock): number[] {
  return goals(match).map((goal) => eventPlayhead(clock, goal));
}

export type ComparisonKey =
  | 'chanceQuality'
  | 'shots'
  | 'onTarget'
  | 'passShare'
  | 'passAccuracy'
  | 'corners'
  | 'crosses'
  | 'duelsWon'
  | 'fouls'
  | 'offsides';

export interface ComparisonRow {
  readonly key: ComparisonKey;
  readonly display: Pair<string>;
  /** Each side's part of the bar, 0 to 1, adding to 1; both 0 when neither has any, so the bars stay empty. */
  readonly share: Pair<number>;
}

function shares(home: number, away: number): Pair<number> {
  const total = home + away;
  return total <= 0 ? [0, 0] : [home / total, away / total];
}

/** The "match in numbers" rows, in broadcast order, formatted for the language. */
export function comparisonRows(stats: Pair<TeamStats>, language: string): ComparisonRow[] {
  const [h, a] = stats;
  const count = (key: ComparisonKey, home: number, away: number): ComparisonRow => ({
    key,
    display: [String(home), String(away)],
    share: shares(home, away),
  });
  const percent = (value: number | null) => (value === null ? '–' : formatPercent(value, language));
  return [
    {
      key: 'chanceQuality',
      display: [formatXg(h.xgUnits, language), formatXg(a.xgUnits, language)],
      share: shares(h.xgUnits, a.xgUnits),
    },
    count('shots', h.shots, a.shots),
    count('onTarget', h.shotsOnTarget, a.shotsOnTarget),
    {
      key: 'passShare',
      display: [formatPercent(h.passShare, language), formatPercent(a.passShare, language)],
      share: [h.passShare, a.passShare],
    },
    {
      key: 'passAccuracy',
      display: [percent(h.passAccuracy), percent(a.passAccuracy)],
      share: shares(h.passAccuracy ?? 0, a.passAccuracy ?? 0),
    },
    count('corners', h.corners, a.corners),
    count('crosses', h.crosses, a.crosses),
    count('duelsWon', h.duelsWon, a.duelsWon),
    count('fouls', h.fouls, a.fouls),
    count('offsides', h.offsides, a.offsides),
  ];
}
