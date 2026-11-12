import { describe, expect, it } from 'vitest';
import { matchClock, teamStats, type ProMatch } from '../../engine/pro';
import { FINAL_2018, golden, loadMatch } from '../../test/proFixtures';
import {
  comparisonRows,
  goalPlayheads,
  matchView,
  playersAt,
  raceUntil,
  raceValueAt,
} from './view';

const match: ProMatch = loadMatch(FINAL_2018);
const clock = matchClock(match);

describe('matchView', () => {
  it('is nothing at kick-off and the finished match at full time', () => {
    const start = matchView(match, clock, 0);
    expect(start.score).toEqual([0, 0]);
    expect(start.fullTime).toBe(false);
    expect(start.players.every((line) => line.starter)).toBe(true);
    const end = matchView(match, clock, clock.total);
    expect(end.fullTime).toBe(true);
    expect(end.score).toEqual([4, 2]);
    expect([end.stats[0].xgUnits, end.stats[1].xgUnits]).toEqual(
      golden.perMatch[String(FINAL_2018)]?.xgUnits,
    );
    expect(end.goals).toHaveLength(6);
    expect(end.race.at(-1)?.elapsed).toBe(clock.total);
    // The own goal counts in the score but is no chance, so the shot map leaves it out.
    expect(end.review.filter((row) => row.kind === 'goal')).toHaveLength(6);
    expect(end.chances.filter((row) => row.kind === 'goal')).toHaveLength(5);
  });

  it('at half-time shows only the first half', () => {
    const half = matchView(match, clock, 2904);
    expect(half.score).toEqual([2, 1]);
    expect(half.goals.map((g) => g.minute.label)).toEqual(['18', '28', '38']);
    expect(half.race.at(-1)?.elapsed).toBe(2904);
    expect(half.events.every((e) => e.period === 1)).toBe(true);
  });

  it('places the goals on the playhead axis in order', () => {
    const times = goalPlayheads(match, clock);
    expect(times).toHaveLength(6);
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });
});

describe('raceUntil and raceValueAt', () => {
  it('ends the race at the playhead and reads values back', () => {
    const race = raceUntil(match, match.events.slice(0, 0), 120);
    expect(race.at(-1)).toMatchObject({ elapsed: 120, units: [0, 0] });
    const full = raceUntil(match, match.events, clock.total);
    expect(raceValueAt(full, -1)).toEqual([0, 0]);
    expect(raceValueAt(full, clock.total)).toEqual(full.at(-1)?.units);
    expect(raceUntil({ periods: [] }, [], 10)).toHaveLength(2);
  });
});

describe('playersAt', () => {
  it('keeps out players not yet on and counts minutes so far', () => {
    const lines = matchView(match, clock, clock.total).players;
    const at60 = playersAt(lines, 60, false);
    expect(at60.every((line) => line.from <= 60)).toBe(true);
    expect(at60.find((line) => line.name === 'N. Kanté')?.minutes).toBe(55);
    expect(at60.find((line) => line.name === 'H. Lloris')?.minutes).toBe(60);
    expect(playersAt(lines, 60, true)).toEqual(lines);
  });
});

describe('comparisonRows', () => {
  it('formats each row and splits the bar between the two sides', () => {
    const rows = comparisonRows(teamStats(match), 'en');
    expect(rows.map((row) => row.key)).toEqual([
      'chanceQuality',
      'shots',
      'onTarget',
      'passShare',
      'passAccuracy',
      'corners',
      'crosses',
      'duelsWon',
      'fouls',
      'offsides',
    ]);
    for (const row of rows) expect(row.share[0] + row.share[1]).toBeCloseTo(1, 9);
    expect(rows[1]?.display).toEqual(['8', '14']);
    expect(rows[0]?.display).toEqual(['1.18', '1.32']);
    const bs = comparisonRows(teamStats(match), 'bs');
    expect(bs[0]?.display).toEqual(['1,18', '1,32']);
    const empty = comparisonRows(teamStats({ events: [] }), 'en');
    expect(empty[4]?.display).toEqual(['–', '–']);
    expect(empty[1]?.share).toEqual([0, 0]);
  });
});
