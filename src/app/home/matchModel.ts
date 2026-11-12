import { MOMENTUM_STATES, momentumSeries, type MomentumState, type Side } from '../../engine';
import type { fetchReviewEvents } from '../../features/momentum/api';
import { suggestFocus, type Reason, type SuggestedFocus } from '../../features/momentum/suggest';
import { toEvidenceList } from '../../features/matches/weights';
import type { MatchSummary } from '../../lib/data';
import type { StateSegment } from '../../ui';

/*
 * The last-match card: which match to show, its score, the momentum states through it as a
 * thin strip, and the training focus its counts suggest. Pure functions of stored rows.
 */

/** One stored, not-undone event of a match, as the momentum feature reads it. */
export type ReviewEvent = Awaited<ReturnType<typeof fetchReviewEvents>>[number];

/** Seconds between momentum readings for the strip; fine enough for a bar a phone wide. */
export const STRIP_STEP_SECONDS = 15;

export interface MatchPick {
  /** A match being tagged right now, if any. */
  readonly live: MatchSummary | null;
  /** The most recent finished match, if any. */
  readonly last: MatchSummary | null;
}

/** Newest first by date; the stored order is not trusted, ties keep their given order. */
export function pickMatches(matches: readonly MatchSummary[]): MatchPick {
  const newest = [...matches].sort((a, b) => b.played_on.localeCompare(a.played_on));
  return {
    live: newest.find((match) => match.status === 'live') ?? null,
    last: newest.find((match) => match.status === 'finished') ?? null,
  };
}

export interface MatchStrip {
  readonly segments: readonly StateSegment[];
  /** Total seconds across all periods. */
  readonly total: number;
  /** Where each period after the first begins, in seconds from kick-off. */
  readonly breaks: readonly number[];
  /** Share of the match spent in each state, largest first, zero shares left out. */
  readonly shares: readonly { readonly state: MomentumState; readonly share: number }[];
  readonly score: Readonly<Record<Side, number>>;
}

function periodLengths(match: MatchSummary, events: readonly ReviewEvent[]): number[] {
  const count = Math.max(match.period_count, ...events.map((event) => event.period));
  return Array.from({ length: count }, (_, index) => {
    const lastClock = Math.max(
      0,
      ...events.filter((event) => event.period === index + 1).map((event) => event.clock_seconds),
    );
    // Stoppage time is never cut off: the period lasts as long as its last tagged event.
    return Math.ceil(Math.max(match.period_minutes * 60, lastClock));
  });
}

/**
 * The momentum state at every moment of the match, as runs of the same state. Each reading
 * holds until the next one; the engine never reads ahead of the moment, so neither does this.
 */
export function matchStrip(match: MatchSummary, events: readonly ReviewEvent[]): MatchStrip {
  // The review read already leaves out undone events, so every row here is current.
  const evidence = toEvidenceList(events.map((event) => ({ ...event, deleted_at: null })));
  const segments: StateSegment[] = [];
  const breaks: number[] = [];
  let offset = 0;
  periodLengths(match, events).forEach((length, index) => {
    if (index > 0) breaks.push(offset);
    const readings = momentumSeries(evidence, index + 1, length, STRIP_STEP_SECONDS);
    for (const reading of readings) {
      const from = offset + reading.t;
      const to = offset + Math.min(reading.t + STRIP_STEP_SECONDS, length);
      if (to <= from) continue;
      const previous = segments[segments.length - 1];
      if (previous !== undefined && previous.state === reading.state && previous.to === from) {
        segments[segments.length - 1] = { ...previous, to };
      } else {
        segments.push({ from, to, state: reading.state });
      }
    }
    offset += length;
  });

  const time = new Map<MomentumState, number>();
  for (const segment of segments) {
    time.set(segment.state, (time.get(segment.state) ?? 0) + segment.to - segment.from);
  }
  const shares = MOMENTUM_STATES.map((state) => ({
    state,
    share: offset > 0 ? (time.get(state) ?? 0) / offset : 0,
  }))
    .filter((entry) => entry.share > 0)
    .sort((a, b) => b.share - a.share);

  const score: Record<Side, number> = { home: 0, away: 0 };
  for (const event of events) if (event.kind === 'goal') score[event.side] += 1;
  return { segments, total: offset, breaks, shares, score };
}

export interface FocusNeed {
  readonly kind: 'focus';
  readonly focus: SuggestedFocus;
  readonly reason: Reason;
  readonly matchId: string;
}

/** The strongest training prompt from the match's counts, with the count that justifies it. */
export function focusNeed(matchId: string, events: readonly ReviewEvent[]): FocusNeed | null {
  const result = suggestFocus(events);
  if (result.status !== 'ok') return null;
  const top = result.suggestions[0];
  const reason = top?.reasons[0];
  if (top === undefined || reason === undefined) return null;
  return { kind: 'focus', focus: top.focus, reason, matchId };
}

/** Where the focus card leads: the planner, prefilled with the focus and its source match. */
export function focusLink(need: FocusNeed): string {
  return `/training/new?focus=${need.focus}&match=${encodeURIComponent(need.matchId)}`;
}
