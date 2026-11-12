import { describe, expect, it } from 'vitest';
import { momentumSeries, type EvidenceEvent } from '../../engine';
import {
  STATE_STYLE,
  clampLabel,
  defaultCursor,
  formatClock,
  formatCount,
  formatDecimal,
  formatPercent,
  formatXg,
  linearScale,
  markRadius,
  minuteTicks,
  nearestIndex,
  niceCeiling,
  runSpan,
  stateDurations,
  stateRuns,
  stepAreaPath,
  stepLinePath,
  timeAtOffset,
} from './chartModel';

const events: EvidenceEvent[] = [
  { id: 'a', period: 1, t: 10, side: 'home', weight: 500 },
  { id: 'b', period: 1, t: 20, side: 'home', weight: 500 },
];

describe('stateRuns and durations', () => {
  const readings = momentumSeries(events, 1, 30, 5);

  it('collapses consecutive readings and covers every index once', () => {
    const runs = stateRuns(readings);
    expect(runs.map((run) => run.state)).toEqual(['insufficient', 'event-sensitive', 'stable']);
    expect(runs[0]).toMatchObject({ fromIndex: 0, toIndex: 1 });
    expect(runs[runs.length - 1]?.toIndex).toBe(readings.length - 1);
    expect(stateRuns([])).toEqual([]);
  });

  it('spans a run until the next reading, and the last run until the end of the period', () => {
    const [first, , last] = stateRuns(readings);
    if (first === undefined || last === undefined) throw new Error('runs missing');
    expect(runSpan(first, readings, 30)).toEqual({ from: 0, to: 10 });
    expect(runSpan(last, readings, 30)).toEqual({ from: 20, to: 30 });
    expect(runSpan(last, readings, 0)).toEqual({ from: 20, to: 20 });
  });

  it('adds up the time in each state to the whole period', () => {
    const durations = stateDurations(readings, 30);
    expect(durations).toEqual({
      insufficient: 10,
      level: 0,
      'window-sensitive': 0,
      'event-sensitive': 10,
      stable: 10,
    });
    expect(Object.values(stateDurations([], 30)).every((value) => value === 0)).toBe(true);
  });

  it('hatches only the insufficient state', () => {
    expect(Object.entries(STATE_STYLE).filter(([, style]) => style.hatched)).toEqual([
      ['insufficient', { fill: 'fill-mute-soft', hatched: true }],
    ]);
  });
});

describe('defaultCursor', () => {
  it('prefers the first opposed moment, then the first favoured moment, then kick-off', () => {
    const favoured = momentumSeries(events, 1, 30, 5);
    expect(defaultCursor(favoured)).toBe(2);
    const opposed = momentumSeries(
      [
        { id: 'h', period: 1, t: 5, side: 'home', weight: 9000 },
        { id: 'a', period: 1, t: 400, side: 'away', weight: 100 },
      ],
      1,
      600,
      5,
    );
    expect(opposed[defaultCursor(opposed)]?.opposed).toBe(true);
    expect(defaultCursor(momentumSeries([], 1, 30, 5))).toBe(0);
    expect(defaultCursor([])).toBe(0);
  });
});

describe('paths', () => {
  const points = [
    { x: 0, y: 50 },
    { x: 50, y: 10 },
    { x: 100, y: 90 },
  ];

  it('draws a step line that holds each value until the next point', () => {
    expect(stepLinePath(points)).toBe('M0 50H50V10H100V90');
    expect(stepLinePath(points, 120)).toBe('M0 50H50V10H100V90H120');
    expect(stepLinePath([{ x: 1.26, y: 2.04 }])).toBe('M1.3 2');
    expect(stepLinePath([])).toBe('');
  });

  it('closes the area against a baseline', () => {
    expect(stepAreaPath(points, 50, 120)).toBe('M0 50L0 50H50V10H100V90H120V50Z');
    expect(stepAreaPath([], 50)).toBe('');
  });
});

describe('scales and ticks', () => {
  it('maps linearly and survives an empty domain', () => {
    const scale = linearScale([0, 10], [100, 200]);
    expect(scale(5)).toBe(150);
    expect(scale(-10)).toBe(0);
    expect(linearScale([3, 3], [7, 9])(100)).toBe(7);
  });

  it('rounds the chart ceiling up to a value a reader can hold in their head', () => {
    expect(niceCeiling(1)).toBe(500);
    expect(niceCeiling(500)).toBe(500);
    expect(niceCeiling(501)).toBe(1000);
    expect(niceCeiling(-2400)).toBe(2500);
    expect(niceCeiling(9000)).toBe(10_000);
    expect(niceCeiling(140_000)).toBe(140_000);
  });

  it('ticks every five minutes and labels every fifteen', () => {
    const ticks = minuteTicks(2700);
    expect(ticks).toHaveLength(10);
    expect(ticks.filter((tick) => tick.major).map((tick) => tick.seconds)).toEqual([
      0, 900, 1800, 2700,
    ]);
    expect(minuteTicks(299)).toEqual([{ seconds: 0, major: true }]);
  });
});

describe('scrubbing geometry', () => {
  it('finds the nearest reading in time', () => {
    const times = [0, 5, 10, 15];
    expect(nearestIndex(times, -3)).toBe(0);
    expect(nearestIndex(times, 7.4)).toBe(1);
    expect(nearestIndex(times, 7.6)).toBe(2);
    expect(nearestIndex(times, 99)).toBe(3);
    expect(nearestIndex([4], 0)).toBe(0);
    expect(nearestIndex([], 3)).toBe(-1);
  });

  it('turns a pointer offset into a time inside the period', () => {
    expect(timeAtOffset(50, 100, 2700)).toBe(1350);
    expect(timeAtOffset(-20, 100, 2700)).toBe(0);
    expect(timeAtOffset(500, 100, 2700)).toBe(2700);
    expect(timeAtOffset(10, 0, 2700)).toBe(0);
  });

  it('keeps the cursor label inside the chart', () => {
    expect(clampLabel(5, 50, 600)).toBe(25);
    expect(clampLabel(300, 50, 600)).toBe(300);
    expect(clampLabel(599, 50, 600)).toBe(575);
    expect(clampLabel(10, 50, 40)).toBe(20);
  });

  it('sizes marks by area, with a visible floor', () => {
    expect(markRadius(10_000, 10)).toBe(10);
    expect(markRadius(2500, 10)).toBe(5);
    expect(markRadius(0, 10)).toBe(2.5);
    expect(markRadius(40_000, 10)).toBe(10);
    expect(markRadius(-5, 10, 1)).toBe(1);
  });
});

describe('formatting', () => {
  it('formats match clocks', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(65.9)).toBe('1:05');
    expect(formatClock(2700)).toBe('45:00');
  });

  it('formats xG, decimals, counts and shares for the reader', () => {
    expect(formatXg(375, 'en')).toBe('0.04');
    expect(formatXg(12_000, 'en')).toBe('1.20');
    expect(formatXg(12_000, 'bs')).toBe('1,20');
    expect(formatDecimal(0.28036, 4, 'bs')).toBe('0,2804');
    expect(formatDecimal(0.5, 1, 'de')).toBe('0.5');
    expect(formatCount(1941, 'en')).toBe('1,941');
    expect(formatCount(2_215_837, 'bs')).toBe('2.215.837');
    expect(formatCount(380, 'en')).toBe('380');
    expect(formatPercent(0.239, 'en')).toBe('24%');
    expect(formatPercent(0.18936, 'en', 1)).toBe('18.9%');
    expect(formatPercent(0.18936, 'bs', 1)).toBe('18,9 %');
  });
});
