import { MOMENTUM_STATES, type MomentumReading, type MomentumState } from '../../engine';

/**
 * Visual treatment per state, in design tokens. Text labels always accompany colour, and
 * `insufficient` is drawn with a hatch so it never relies on colour alone.
 */
export const STATE_STYLE: Readonly<
  Record<MomentumState, { readonly fill: string; readonly hatched: boolean }>
> = {
  stable: { fill: 'fill-pitch', hatched: false },
  'event-sensitive': { fill: 'fill-amber', hatched: false },
  'window-sensitive': { fill: 'fill-clay', hatched: false },
  level: { fill: 'fill-mute', hatched: false },
  insufficient: { fill: 'fill-mute-soft', hatched: true },
};

export interface StateRun {
  readonly state: MomentumState;
  readonly fromIndex: number;
  /** Inclusive. */
  readonly toIndex: number;
}

/** Collapse consecutive readings with the same state into runs for drawing. */
export function stateRuns(readings: readonly MomentumReading[]): StateRun[] {
  const runs: StateRun[] = [];
  readings.forEach((reading, index) => {
    const last = runs[runs.length - 1];
    if (last?.state === reading.state) {
      runs[runs.length - 1] = { ...last, toIndex: index };
    } else {
      runs.push({ state: reading.state, fromIndex: index, toIndex: index });
    }
  });
  return runs;
}

/** Start and end time of a run: a reading holds until the next one, the last until the end. */
export function runSpan(
  run: StateRun,
  readings: readonly MomentumReading[],
  durationSeconds: number,
): { readonly from: number; readonly to: number } {
  const from = readings[run.fromIndex]?.t ?? 0;
  const to = readings[run.toIndex + 1]?.t ?? durationSeconds;
  return { from, to: Math.max(from, to) };
}

/** Seconds spent in each state, so the hidden table and the strip tell the same story. */
export function stateDurations(
  readings: readonly MomentumReading[],
  durationSeconds: number,
): Record<MomentumState, number> {
  const totals = Object.fromEntries(MOMENTUM_STATES.map((state) => [state, 0])) as Record<
    MomentumState,
    number
  >;
  for (const run of stateRuns(readings)) {
    const span = runSpan(run, readings, durationSeconds);
    totals[run.state] += span.to - span.from;
  }
  return totals;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

const round = (value: number): string => String(Math.round(value * 10) / 10);

/** Step line: each value holds from its point until the next point's x. */
export function stepLinePath(points: readonly Point[], endX?: number): string {
  const first = points[0];
  if (first === undefined) return '';
  const parts = [`M${round(first.x)} ${round(first.y)}`];
  for (const point of points.slice(1)) parts.push(`H${round(point.x)}V${round(point.y)}`);
  if (endX !== undefined) parts.push(`H${round(endX)}`);
  return parts.join('');
}

/** The area between a step line and a baseline, closed so it can be filled. */
export function stepAreaPath(points: readonly Point[], baseY: number, endX?: number): string {
  const first = points[0];
  const last = points[points.length - 1];
  if (first === undefined || last === undefined) return '';
  const line = stepLinePath(points, endX).slice(1);
  return `M${round(first.x)} ${round(baseY)}L${line}V${round(baseY)}Z`;
}

/** Linear map from a domain to a range. */
export function linearScale(
  domain: readonly [number, number],
  range: readonly [number, number],
): (value: number) => number {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0;
  return (value) => (span === 0 ? r0 : r0 + ((value - d0) / span) * (r1 - r0));
}

const NICE_XG = [0.05, 0.1, 0.2, 0.25, 0.5, 1, 1.5, 2, 3, 5, 10];

/**
 * The smallest round xG value at or above the series peak, in 1/10,000 units, so the
 * gridline label is a number a reader can hold in their head.
 */
export function niceCeiling(peakUnits: number): number {
  const peak = Math.abs(peakUnits) / 10_000;
  const nice = NICE_XG.find((candidate) => candidate >= peak - 1e-9);
  return Math.round((nice ?? Math.ceil(peak)) * 10_000);
}

export interface MinuteTick {
  readonly seconds: number;
  /** Labelled tick (every 15 minutes); the others are unlabelled 5-minute ticks. */
  readonly major: boolean;
}

/** Ticks every 5 minutes, labelled every 15, from kick-off to the end of the period. */
export function minuteTicks(durationSeconds: number): MinuteTick[] {
  const ticks: MinuteTick[] = [];
  for (let seconds = 0; seconds <= durationSeconds; seconds += 300) {
    ticks.push({ seconds, major: seconds % 900 === 0 });
  }
  return ticks;
}

/**
 * Where the cursor opens: the first moment the windows favour opposite teams (the point
 * of the tool), else the first moment a side is favoured, else kick-off.
 */
export function defaultCursor(readings: readonly MomentumReading[]): number {
  const opposed = readings.findIndex((reading) => reading.opposed);
  if (opposed >= 0) return opposed;
  return Math.max(
    readings.findIndex((reading) => reading.favoured !== null),
    0,
  );
}

/** Index of the reading closest in time to `t` (readings are in time order). */
export function nearestIndex(times: readonly number[], t: number): number {
  if (times.length === 0) return -1;
  let low = 0;
  let high = times.length - 1;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if ((times[middle] ?? 0) <= t) low = middle;
    else high = middle;
  }
  const lowGap = Math.abs((times[low] ?? 0) - t);
  const highGap = Math.abs((times[high] ?? 0) - t);
  return highGap < lowGap ? high : low;
}

/** Time under a pointer, clamped to the period. */
export function timeAtOffset(offsetX: number, width: number, durationSeconds: number): number {
  if (width <= 0) return 0;
  const share = Math.min(Math.max(offsetX / width, 0), 1);
  return share * durationSeconds;
}

/**
 * Mark radius with area proportional to chance quality (1/10,000 units), floored so a
 * tiny chance stays visible and tappable to the eye.
 */
export function markRadius(weight: number, maxRadius: number, minRadius = 2.5): number {
  const share = Math.min(Math.max(weight, 0) / 10_000, 1);
  return Math.max(minRadius, maxRadius * Math.sqrt(share));
}

/** Keep a centred label of `labelWidth` inside `[0, width]`. */
export function clampLabel(x: number, labelWidth: number, width: number): number {
  const half = labelWidth / 2;
  if (width <= labelWidth) return width / 2;
  return Math.min(Math.max(x, half), width - half);
}

/** mm:ss for a number of seconds into a half. */
export function formatClock(totalSeconds: number): string {
  const whole = Math.floor(totalSeconds);
  return `${String(Math.floor(whole / 60))}:${String(whole % 60).padStart(2, '0')}`;
}

const DECIMAL_SEPARATOR: Readonly<Record<string, string>> = { bs: ',', en: '.' };

/**
 * A decimal with a fixed number of places. The separator comes from our own table
 * because some embedded browsers accept the Bosnian locale but ship no number data
 * for it and silently print a decimal point.
 */
export function formatDecimal(value: number, digits: number, language: string): string {
  return value.toFixed(digits).replace('.', DECIMAL_SEPARATOR[language] ?? '.');
}

/** xG stored in 1/10,000 units, shown with two decimals. */
export function formatXg(units: number, language: string): string {
  return formatDecimal(units / 10_000, 2, language);
}

const GROUP_SEPARATOR: Readonly<Record<string, string>> = { bs: '.', en: ',' };

/** A whole number with the language's digit grouping (1,941 / 1.941), same reason as above. */
export function formatCount(value: number, language: string): string {
  return Math.round(value)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, GROUP_SEPARATOR[language] ?? ',');
}

/** A share in 0..1 as a percentage, with the decimal separator of the language. */
export function formatPercent(share: number, language: string, digits = 0): string {
  // Bosnian writes a (non-breaking) space before the percent sign.
  const sign = language === 'bs' ? ' %' : '%';
  return `${formatDecimal(share * 100, digits, language)}${sign}`;
}
