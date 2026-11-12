import { describe, expect, it } from 'vitest';
import { momentumSeries } from '../../engine/momentum';
import { decodeEvent, type ProEvent } from '../../engine/pro/schema';
import { FINAL_2018, golden, loadMatch } from '../../test/proFixtures';
import { TERRITORY_UNITS } from '../matches/weights';
import { evidenceOf, scoreOf, shotTotals } from '../momentum/reviewModel';
import { toReview } from './toReview';

const e = (tuple: readonly number[], i: number): ProEvent =>
  decodeEvent(tuple as Parameters<typeof decodeEvent>[0], i);

describe('toReview on the 2018 final', () => {
  const match = loadMatch(FINAL_2018);
  const rows = toReview(match);
  const expected = golden.perMatch[String(FINAL_2018)];
  const count = (kind: string, side: 'home' | 'away') =>
    rows.filter((row) => row.kind === kind && row.side === side).length;

  it('scores 4-2, own goal included, and draws the same shots as the golden file', () => {
    expect(scoreOf(rows)).toEqual({ home: 4, away: 2 });
    const shots = shotTotals(toReview(match, { ownGoals: false }));
    expect([shots.home.shots, shots.away.shots]).toEqual(expected?.shots);
    expect([shots.home.chanceQuality, shots.away.chanceQuality]).toEqual(expected?.xgUnits);
    expect([shots.home.goals, shots.away.goals]).toEqual(expected?.goals);
  });

  it('has the golden corners and territory tags at the app weights', () => {
    expect([count('corner', 'home'), count('corner', 'away')]).toEqual(expected?.corners);
    for (const row of rows) {
      if (row.kind === 'goal' || row.kind.startsWith('shot')) continue;
      expect(row.weight).toBe(TERRITORY_UNITS[row.kind as keyof typeof TERRITORY_UNITS]);
    }
    expect(count('box_entry', 'home') + count('box_entry', 'away')).toBeGreaterThan(10);
    expect(count('high_recovery', 'home') + count('high_recovery', 'away')).toBeGreaterThan(10);
    expect(new Set(rows.map((row) => row.id)).size).toBe(rows.length);
  });

  it('is read by the momentum engine like a coach match', () => {
    const series = momentumSeries(evidenceOf(rows), 1, match.periods[0]?.seconds ?? 0, 5);
    expect(series.length).toBeGreaterThan(500);
    expect(series.some((reading) => reading.favoured !== null)).toBe(true);
  });
});

describe('toReview rules', () => {
  it('maps a goal, a saved shot and a miss, and fixes a penalty at 7,600', () => {
    const rows = toReview({
      events: [
        e([1, 10, 0, 0, 1, 90, 50, -1, -1, 3], 0),
        e([1, 20, 0, 0, 1, 90, 50, -1, -1, 1], 1),
        e([1, 30, 1, 1, 1, 80, 40, -1, -1, 0], 2),
        e([1, 40, 1, 1, 1, 89, 50, -1, -1, 16 + 2 + 1], 3),
      ],
    });
    expect(rows.map((row) => [row.kind, row.side])).toEqual([
      ['goal', 'home'],
      ['shot_on_target', 'home'],
      ['shot_off_target', 'away'],
      ['goal', 'away'],
    ]);
    expect(rows[3]?.weight).toBe(7600);
    expect(rows[2]).toMatchObject({ x: 80, y: 40, clock_seconds: 30, period: 1 });
  });

  it('enters the box only from outside, with an accurate pass or a set-piece cross', () => {
    const rows = toReview({
      events: [
        e([1, 0, 0, 0, 0, 70, 50, 90, 50, 1], 0),
        e([1, 1, 0, 0, 0, 70, 50, 90, 50, 0], 1),
        e([1, 2, 0, 0, 0, 86, 50, 90, 50, 1], 2),
        e([1, 3, 0, 0, 3, 70, 10, 90, 50, 32], 3),
        e([1, 4, 0, 0, 3, 100, 0, 90, 50, 64], 4),
      ],
    });
    expect(rows.filter((row) => row.kind === 'box_entry').map((row) => row.id)).toEqual([
      '0:box_entry',
      '3:box_entry',
    ]);
    expect(rows.filter((row) => row.kind === 'corner')).toHaveLength(1);
  });

  it('turns one change of possession into one tag, by where the ball was won', () => {
    const rows = toReview({
      events: [
        e([1, 0, 0, 0, 0, 30, 50, 40, 50, 0], 0),
        e([1, 2, 1, 1, 4, 65, 50, -1, -1, 8192], 1), // won high by away
        e([1, 3, 1, 1, 0, 66, 50, 70, 50, 1], 2), // same possession: no second tag
        e([1, 5, 0, 0, 2, 20, 50, -1, -1, 1], 3), // home wins a duel deep: no evidence
        e([1, 7, 0, 0, 0, 20, 50, 40, 50, 0], 4),
        e([1, 9, 1, 1, 0, 55, 30, 60, 30, 1], 5), // away wins it at 55: home lost it in own half
        e([1, 11, 0, 0, 3, 0, 50, 50, 50, 4096], 6), // restart: never a change
        e([2, 0, 1, 1, 0, 70, 50, 80, 50, 1], 7), // new period: nobody holds the ball yet
      ],
    });
    const tags = rows.filter((row) => row.kind !== 'box_entry');
    expect(tags.map((row) => [row.kind, row.side, row.x, row.y])).toEqual([
      ['high_recovery', 'away', 65, 50],
      ['lost_ball_own_half', 'home', 45, 70],
    ]);
    expect(tags.every((row) => row.weight === 150)).toBe(true);
  });

  it('keeps own goals out when asked', () => {
    const own = [e([1, 5, 1, 1, 4, 2, 50, -1, -1, 512], 0)];
    expect(toReview({ events: own })).toMatchObject([{ kind: 'goal', side: 'home', weight: 0 }]);
    expect(toReview({ events: own }, { ownGoals: false })).toEqual([]);
  });
});
