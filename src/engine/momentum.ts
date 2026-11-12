import { EngineError, type EvidenceEvent, type Lean, type Side } from './types';

/** Trailing windows the research pre-registered: 3, 5 and 10 minutes. */
export const DEFAULT_WINDOWS_SECONDS: readonly number[] = [180, 300, 600];

/** One trailing window's view of who is ahead, and how fragile that view is. */
export interface WindowAssessment {
  readonly windowSeconds: number;
  /** Home weight minus away weight inside the window. */
  readonly differential: number;
  readonly lean: Lean;
  /** Contributing events, oldest first. */
  readonly events: readonly EvidenceEvent[];
  /** Largest single contribution on the favoured side (0 when level). */
  readonly largestAligned: number;
  /** Event behind `largestAligned`; removing it does the most damage. */
  readonly decisiveEventId: string | null;
  /** The lean survives the removal of any one contributing event. */
  readonly robust: boolean;
  /** Removing one event would hand the lean to the other side. */
  readonly canReverse: boolean;
  /** Removing one event would level the window without reversing it. */
  readonly canTie: boolean;
}

/**
 * What a coach is allowed to conclude at one moment.
 * - `insufficient`: nothing observed in the widest window.
 * - `level`: evidence exists but no window favours a side.
 * - `window-sensitive`: the answer changes with how far back you look.
 * - `event-sensitive`: all windows agree, but one event carries the result.
 * - `stable`: all windows agree and no single event can change that.
 */
export type MomentumState =
  'insufficient' | 'level' | 'window-sensitive' | 'event-sensitive' | 'stable';

export const MOMENTUM_STATES: readonly MomentumState[] = [
  'insufficient',
  'level',
  'window-sensitive',
  'event-sensitive',
  'stable',
];

export interface MomentumReading {
  readonly period: number;
  readonly t: number;
  readonly state: MomentumState;
  /** Set only when every window agrees on a side. */
  readonly favoured: Side | null;
  /** Two windows favour opposite sides (stronger than one window merely being empty). */
  readonly opposed: boolean;
  readonly windows: readonly WindowAssessment[];
}

function assertEvent(event: EvidenceEvent): void {
  if (!Number.isSafeInteger(event.weight) || event.weight < 0) {
    throw new EngineError(
      'INVALID_EVENT',
      `Event ${event.id}: weight must be a non-negative integer.`,
    );
  }
  if (!Number.isFinite(event.t) || event.t < 0) {
    throw new EngineError('INVALID_EVENT', `Event ${event.id}: time must be zero or later.`);
  }
  if (!Number.isInteger(event.period) || event.period < 1) {
    throw new EngineError('INVALID_EVENT', `Event ${event.id}: period must be 1 or higher.`);
  }
}

function assertWindows(windows: readonly number[]): void {
  if (windows.length === 0) {
    throw new EngineError('INVALID_WINDOW', 'At least one window is required.');
  }
  windows.forEach((seconds, index) => {
    const previous = index === 0 ? 0 : (windows[index - 1] ?? 0);
    if (!Number.isFinite(seconds) || seconds <= previous) {
      throw new EngineError('INVALID_WINDOW', 'Windows must be positive and strictly increasing.');
    }
  });
}

function toLean(value: number): Lean {
  if (value > 0) return 1;
  if (value < 0) return -1;
  return 0;
}

function signedWeight(event: EvidenceEvent): number {
  return event.side === 'home' ? event.weight : -event.weight;
}

/**
 * Assess one window exactly. With integer weights the worst single removal is
 * the largest contribution on the favoured side, so no enumeration is needed.
 */
export function assessWindow(
  events: readonly EvidenceEvent[],
  windowSeconds: number,
): WindowAssessment {
  const differential = events.reduce((sum, event) => sum + signedWeight(event), 0);
  const lean = toLean(differential);
  let largestAligned = 0;
  let decisiveEventId: string | null = null;
  if (lean !== 0) {
    for (const event of events) {
      const aligned = lean * signedWeight(event);
      if (aligned > largestAligned) {
        largestAligned = aligned;
        decisiveEventId = event.id;
      }
    }
  }
  const margin = Math.abs(differential);
  return {
    windowSeconds,
    differential,
    lean,
    events,
    largestAligned,
    decisiveEventId,
    robust: lean !== 0 && margin > largestAligned,
    canReverse: lean !== 0 && margin < largestAligned,
    canTie: lean !== 0 && margin === largestAligned,
  };
}

function classify(windows: readonly WindowAssessment[]): {
  state: MomentumState;
  favoured: Side | null;
} {
  const widest = windows[windows.length - 1];
  if (widest === undefined || widest.events.length === 0) {
    return { state: 'insufficient', favoured: null };
  }
  const leans = windows.map((window) => window.lean);
  if (leans.every((lean) => lean === 0)) {
    return { state: 'level', favoured: null };
  }
  const first = leans[0] ?? 0;
  const agreed = first !== 0 && leans.every((lean) => lean === first);
  if (!agreed) {
    return { state: 'window-sensitive', favoured: null };
  }
  const favoured: Side = first > 0 ? 'home' : 'away';
  const state = windows.every((window) => window.robust) ? 'stable' : 'event-sensitive';
  return { state, favoured };
}

/** Events of one period in time order, validated once. Input order is not trusted. */
function periodEvents(events: readonly EvidenceEvent[], period: number): EvidenceEvent[] {
  const selected = events.filter((event) => {
    assertEvent(event);
    return event.period === period;
  });
  return selected.sort((a, b) => a.t - b.t || a.id.localeCompare(b.id));
}

function readSorted(
  sorted: readonly EvidenceEvent[],
  period: number,
  t: number,
  windows: readonly number[],
): MomentumReading {
  const assessments = windows.map((seconds) =>
    assessWindow(
      sorted.filter((event) => event.t > t - seconds && event.t <= t),
      seconds,
    ),
  );
  const opposed =
    assessments.some((window) => window.lean > 0) && assessments.some((window) => window.lean < 0);
  return { period, t, opposed, windows: assessments, ...classify(assessments) };
}

/**
 * Read the evidence at one moment. Each window is open on the left and closed
 * on the right, `(t - window, t]`, and never includes events after `t`.
 */
export function readMomentum(
  events: readonly EvidenceEvent[],
  period: number,
  t: number,
  windows: readonly number[] = DEFAULT_WINDOWS_SECONDS,
): MomentumReading {
  assertWindows(windows);
  if (!Number.isFinite(t) || t < 0) {
    throw new EngineError('INVALID_GRID', 'Reading time must be zero or later.');
  }
  return readSorted(periodEvents(events, period), period, t, windows);
}

/** Readings on a regular grid from 0 to `durationSeconds` inclusive. */
export function momentumSeries(
  events: readonly EvidenceEvent[],
  period: number,
  durationSeconds: number,
  stepSeconds = 5,
  windows: readonly number[] = DEFAULT_WINDOWS_SECONDS,
): MomentumReading[] {
  assertWindows(windows);
  if (!Number.isInteger(durationSeconds) || durationSeconds < 0) {
    throw new EngineError('INVALID_GRID', 'Duration must be a whole number of seconds.');
  }
  if (!Number.isInteger(stepSeconds) || stepSeconds < 1) {
    throw new EngineError('INVALID_GRID', 'Step must be a whole number of seconds, 1 or more.');
  }
  const sorted = periodEvents(events, period);
  const readings: MomentumReading[] = [];
  for (let t = 0; t <= durationSeconds; t += stepSeconds) {
    readings.push(readSorted(sorted, period, t, windows));
  }
  return readings;
}

export interface SeriesSummary {
  readonly grid: number;
  readonly byState: Readonly<Record<MomentumState, number>>;
  /** Every window favours the same side. */
  readonly agreement: number;
  /** Agreement that survives any single removal in every window. */
  readonly agreementRobust: number;
  /** Agreement where one removal could reverse at least one window. */
  readonly agreementCanReverse: number;
}

/** Count how often each conclusion was available across a series. */
export function summariseSeries(readings: readonly MomentumReading[]): SeriesSummary {
  const byState: Record<MomentumState, number> = {
    insufficient: 0,
    level: 0,
    'window-sensitive': 0,
    'event-sensitive': 0,
    stable: 0,
  };
  let agreementCanReverse = 0;
  for (const reading of readings) {
    byState[reading.state] += 1;
    if (reading.favoured !== null && reading.windows.some((window) => window.canReverse)) {
      agreementCanReverse += 1;
    }
  }
  return {
    grid: readings.length,
    byState,
    agreement: byState.stable + byState['event-sensitive'],
    agreementRobust: byState.stable,
    agreementCanReverse,
  };
}

export interface WindowComparison {
  readonly grid: number;
  readonly bothNonzero: number;
  /** The two windows favour opposite sides. */
  readonly opposite: number;
}

/** How often two windows of the same series point at opposite sides. */
export function compareWindows(
  readings: readonly MomentumReading[],
  shortSeconds: number,
  longSeconds: number,
): WindowComparison {
  let bothNonzero = 0;
  let opposite = 0;
  for (const reading of readings) {
    const short = reading.windows.find((window) => window.windowSeconds === shortSeconds);
    const long = reading.windows.find((window) => window.windowSeconds === longSeconds);
    if (short === undefined || long === undefined) {
      throw new EngineError('INVALID_WINDOW', 'Both windows must be part of the series.');
    }
    if (short.lean !== 0 && long.lean !== 0) {
      bothNonzero += 1;
      if (short.lean !== long.lean) opposite += 1;
    }
  }
  return { grid: readings.length, bothNonzero, opposite };
}

const DECIMAL_PATTERN = /^\d+(?:\.(\d+))?$/;

/**
 * Parse a non-negative decimal string into integer units of 10^-decimals
 * without floating-point rounding, e.g. `"0.0375"` -> `375` at 4 decimals.
 */
export function decimalToUnits(value: string, decimals = 4): number {
  const match = DECIMAL_PATTERN.exec(value);
  const fraction = match?.[1] ?? '';
  if (match === null || fraction.length > decimals) {
    throw new EngineError(
      'INVALID_DECIMAL',
      `Expected a non-negative decimal with at most ${String(decimals)} places.`,
    );
  }
  const whole = value.split('.')[0] ?? '0';
  const units = Number(whole + fraction.padEnd(decimals, '0'));
  if (!Number.isSafeInteger(units)) {
    throw new EngineError('INVALID_DECIMAL', 'Decimal is too large to represent exactly.');
  }
  return units;
}
