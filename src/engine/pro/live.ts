import { otherTeam, type ProEvent, type ProMatch } from './schema';
import type { Pair } from './stats';
import { matchMinute, periodSpans, type MatchMinute, type PeriodSpan } from './timeline';

/*
 * "As live": the match replayed on one running playhead, in seconds of play from kick-off with
 * the periods laid end to end (the half-time break is not part of it). Everything a screen
 * shows while replaying is read from the events up to the playhead, never from the header.
 */

export interface MatchClock {
  readonly spans: readonly PeriodSpan[];
  /** Seconds of play in the whole match. */
  readonly total: number;
}

export function matchClock(match: Pick<ProMatch, 'periods'>): MatchClock {
  const spans = periodSpans(match);
  return { spans, total: spans[spans.length - 1]?.to ?? 0 };
}

export interface ClockMoment {
  readonly period: number;
  /** Seconds into that period. */
  readonly t: number;
  readonly minute: MatchMinute;
}

/** Keep a playhead inside the match. */
export function clampPlayhead(clock: MatchClock, playhead: number): number {
  if (!Number.isFinite(playhead)) return 0;
  return Math.min(Math.max(playhead, 0), clock.total);
}

/** The period and clock of a playhead. A moment on a boundary belongs to the later period. */
export function momentAt(clock: MatchClock, playhead: number): ClockMoment {
  const at = clampPlayhead(clock, playhead);
  const span =
    clock.spans.find((candidate) => at >= candidate.from && at < candidate.to) ??
    clock.spans[clock.spans.length - 1];
  const period = span?.period ?? 1;
  const t = Math.floor(at - (span?.from ?? 0));
  return { period, t, minute: matchMinute(period, t) };
}

/** The playhead of a moment in a period. */
export function playheadOf(clock: MatchClock, period: number, t: number): number {
  const span = clock.spans.find((candidate) => candidate.period === period);
  return clampPlayhead(clock, (span?.from ?? 0) + t);
}

/** Where an event sits on the playhead axis. */
export function eventPlayhead(clock: MatchClock, event: Pick<ProEvent, 'period' | 't'>): number {
  return playheadOf(clock, event.period, event.t);
}

/**
 * The events that had happened by the playhead (an event at the playhead has happened). The
 * events are in match order, so this is a binary search and one slice of the original list.
 */
export function eventsUntil(
  match: Pick<ProMatch, 'periods' | 'events'>,
  playhead: number,
  clock: MatchClock = matchClock(match),
): readonly ProEvent[] {
  const events = match.events;
  let low = 0;
  let high = events.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    const event = events[middle];
    if (event !== undefined && eventPlayhead(clock, event) <= playhead) low = middle + 1;
    else high = middle;
  }
  return low === events.length ? events : events.slice(0, low);
}

/** Goals for each team in a list of events: own shots that went in plus the other side's own goals. */
export function scoreOfEvents(events: readonly ProEvent[]): Pair<number> {
  const score: [number, number] = [0, 0];
  for (const event of events) {
    if (event.kind === 'shot' && event.goal) score[event.team] += 1;
    if (event.ownGoal) score[otherTeam(event.team)] += 1;
  }
  return score;
}
