import { readMomentum, type MomentumReading, type Side } from '../../engine';
import { isShotKind } from '../matches/weights';
import { evidenceOf, type ReviewEvent } from './reviewModel';

/** What has been counted for one side so far. `units` is chance quality in 1/10,000 of a goal. */
export interface LiveNumbers {
  readonly goals: number;
  readonly shots: number;
  readonly onTarget: number;
  readonly units: number;
  readonly bigChances: number;
  readonly boxEntries: number;
  readonly corners: number;
  readonly highRecoveries: number;
}

/** The rows of the "so far" table, in the order they are shown. Goals are the score above it. */
export const LIVE_MEASURES = [
  'shots',
  'onTarget',
  'units',
  'bigChances',
  'boxEntries',
  'corners',
  'highRecoveries',
] as const;
export type LiveMeasure = (typeof LIVE_MEASURES)[number];

/** How many of the newest events the centre lists. */
export const LATEST_COUNT = 4;

export interface LiveSnapshot {
  /** The period of the newest event, or 1 before anything is recorded. */
  readonly period: number;
  /** The clock of the newest event; null before anything is recorded. */
  readonly clockSeconds: number | null;
  readonly numbers: Readonly<Record<Side, LiveNumbers>>;
  /** The engine's reading at the newest event; null before anything is recorded. */
  readonly reading: MomentumReading | null;
  /** Newest first. */
  readonly latest: readonly ReviewEvent[];
}

const NOTHING: LiveNumbers = {
  goals: 0,
  shots: 0,
  onTarget: 0,
  units: 0,
  bigChances: 0,
  boxEntries: 0,
  corners: 0,
  highRecoveries: 0,
};

function count(events: readonly ReviewEvent[], side: Side): LiveNumbers {
  const mine = events.filter((event) => event.side === side);
  const of = (kind: ReviewEvent['kind']) => mine.filter((event) => event.kind === kind).length;
  const shots = mine.filter((event) => isShotKind(event.kind));
  return {
    goals: of('goal'),
    shots: shots.length,
    onTarget: of('goal') + of('shot_on_target'),
    units: shots.reduce((sum, event) => sum + event.weight, 0),
    bigChances: of('big_chance'),
    boxEntries: of('box_entry'),
    corners: of('corner'),
    highRecoveries: of('high_recovery'),
  };
}

/** Later period first, then later clock; equal moments keep the order they were read in. */
function newestFirst(events: readonly ReviewEvent[]): ReviewEvent[] {
  return events
    .map((event, index) => ({ event, index }))
    .sort(
      (a, b) =>
        b.event.period - a.event.period ||
        b.event.clock_seconds - a.event.clock_seconds ||
        b.index - a.index,
    )
    .map((entry) => entry.event);
}

/**
 * A match in progress, as far as the recorded events say. The centre cannot know the clock on
 * the recording phone, so "now" is the newest event: the counts, the score and the reading are
 * all as of that moment, and the screen says so.
 */
export function liveSnapshot(events: readonly ReviewEvent[]): LiveSnapshot {
  const ordered = newestFirst(events);
  const newest = ordered[0];
  if (newest === undefined) {
    return {
      period: 1,
      clockSeconds: null,
      numbers: { home: NOTHING, away: NOTHING },
      reading: null,
      latest: [],
    };
  }
  return {
    period: newest.period,
    clockSeconds: newest.clock_seconds,
    numbers: { home: count(events, 'home'), away: count(events, 'away') },
    reading: readMomentum(evidenceOf(events), newest.period, newest.clock_seconds),
    latest: ordered.slice(0, LATEST_COUNT),
  };
}

export type NowVerdict = 'favoured' | 'level' | 'unclear' | 'insufficient';

/** The one-line answer to "who is on top right now", kept as cautious as the engine's state. */
export function nowVerdict(reading: MomentumReading | null): NowVerdict {
  if (reading === null || reading.state === 'insufficient') return 'insufficient';
  if (reading.favoured !== null) return 'favoured';
  return reading.state === 'level' ? 'level' : 'unclear';
}
