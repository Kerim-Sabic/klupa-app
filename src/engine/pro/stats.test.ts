import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { FINAL_2018, golden, loadIndex, loadMatch } from '../../test/proFixtures';
import { playerLines } from './players';
import { teamStats } from './stats';

/*
 * Golden: for every one of the 115 matches, the numbers the Python pipeline computed from the
 * provider's raw files must come out of the compact files and this TypeScript exactly.
 */
describe('team stats against the Python golden numbers', () => {
  const index = loadIndex();

  it('covers every match in the list', () => {
    expect(Object.keys(golden.perMatch)).toHaveLength(golden.matches);
    expect(index.matches.map((m) => String(m.id)).sort()).toEqual(
      Object.keys(golden.perMatch).sort(),
    );
  });

  it.each(index.matches.map((m) => [m.id, `${m.home} v ${m.away}`] as const))(
    'match %i (%s)',
    (id) => {
      const match = loadMatch(id);
      const expected = golden.perMatch[String(id)];
      const stats = teamStats(match);
      const pick = (key: keyof (typeof stats)[0]) => [stats[0][key], stats[1][key]];
      expect(match.events).toHaveLength(expected?.events ?? -1);
      expect(pick('passes')).toEqual(expected?.passes);
      expect(pick('accuratePasses')).toEqual(expected?.accuratePasses);
      expect(pick('shots')).toEqual(expected?.shots);
      expect(pick('shotsOnTarget')).toEqual(expected?.shotsOnTarget);
      expect(pick('goals')).toEqual(expected?.goals);
      expect(pick('ownGoalsFor')).toEqual(expected?.ownGoalsFor);
      expect(pick('corners')).toEqual(expected?.corners);
      expect(pick('xgUnits')).toEqual(expected?.xgUnits);
      // Goals that count for a team: its own shots plus the other team's own goals.
      expect(stats.map((team) => team.goals + team.ownGoalsFor)).toEqual(
        match.teams.map((t) => t.score),
      );
    },
  );

  it('adds up to the published event total', () => {
    const total = index.matches.reduce((sum, m) => sum + loadMatch(m.id).events.length, 0);
    expect(total).toBe(golden.events);
  });
});

describe('teamStats', () => {
  const match = loadMatch(FINAL_2018);
  const stats = teamStats(match);

  it('derives shares and accuracy from the counts', () => {
    expect(stats[0].passShare + stats[1].passShare).toBeCloseTo(1, 12);
    expect(stats[0].passShare).toBeCloseTo(241 / 759, 12);
    expect(stats[1].passAccuracy).toBeCloseTo(429 / 518, 12);
    expect(stats[0].duelsWon).toBeLessThanOrEqual(stats[0].duels);
    expect(stats[0].fouls + stats[1].fouls).toBeGreaterThan(0);
  });

  it('says nothing it cannot know for an empty match', () => {
    const empty = teamStats({ events: [] });
    expect(empty[0].passAccuracy).toBeNull();
    expect(empty[0].passShare).toBe(0.5);
  });

  it('team totals are the sums of the players plus events with no named player', () => {
    fc.assert(
      fc.property(fc.constantFrom(...loadIndex().matches.map((m) => m.id)), (id) => {
        const m = loadMatch(id);
        const lines = playerLines(m);
        const s = teamStats(m);
        for (const team of [0, 1] as const) {
          const mine = lines.filter((line) => line.team === team);
          const unnamed = m.events.filter((e) => e.team === team && e.player < 0);
          const sum = (key: 'passes' | 'shots' | 'goals' | 'xgUnits' | 'duelsWon') =>
            mine.reduce((total, line) => total + line[key], 0);
          expect(sum('passes') + unnamed.filter((e) => e.kind === 'pass').length).toBe(
            s[team].passes,
          );
          expect(sum('shots') + unnamed.filter((e) => e.kind === 'shot').length).toBe(
            s[team].shots,
          );
          if (unnamed.length === 0) {
            expect(sum('goals')).toBe(s[team].goals);
            expect(sum('xgUnits')).toBe(s[team].xgUnits);
            expect(sum('duelsWon')).toBe(s[team].duelsWon);
          }
        }
      }),
      { numRuns: 20 },
    );
  });
});
