import { describe, expect, it } from 'vitest';
import { FINAL_2018, loadMatch } from '../../test/proFixtures';
import { playerLines } from './players';

describe('playerLines', () => {
  const match = loadMatch(FINAL_2018);
  const lines = playerLines(match);
  const line = (name: string) => lines.find((entry) => entry.name === name);

  it('has one line per player in file order', () => {
    expect(lines.map((entry) => entry.name)).toEqual(match.players.map((player) => player.name));
    expect(lines.filter((entry) => entry.starter)).toHaveLength(22);
  });

  it('reads minutes from the provider and counts goals, shots and chance quality', () => {
    expect(line('N. Kanté')).toMatchObject({ from: 0, to: 55, minutes: 55 });
    expect(line('K. Mbappé')).toMatchObject({ goals: 1 });
    expect(line('A. Griezmann')?.goals).toBe(1);
    expect(line('A. Griezmann')?.xgUnits).toBeGreaterThanOrEqual(7600);
    expect(line('M. Mandžukić')?.goals).toBe(1);
  });

  it('derives accuracy only when there were passes', () => {
    for (const entry of lines) {
      if (entry.passes === 0) expect(entry.passAccuracy).toBeNull();
      else expect(entry.passAccuracy).toBeCloseTo(entry.accuratePasses / entry.passes, 12);
      expect(entry.duelsWon).toBeLessThanOrEqual(entry.duels);
    }
  });

  it('counts the provider tags for key passes, assists and interceptions', () => {
    const total = (key: 'keyPasses' | 'assists' | 'interceptions') =>
      lines.reduce((sum, entry) => sum + entry[key], 0);
    expect(total('keyPasses')).toBe(match.events.filter((e) => e.keyPass).length);
    expect(total('assists')).toBe(match.events.filter((e) => e.assist).length);
    expect(total('interceptions')).toBe(match.events.filter((e) => e.interception).length);
  });

  it('gives a player who never touched the ball zeros', () => {
    const quiet = playerLines({ players: match.players.slice(0, 1), events: [] });
    expect(quiet[0]).toMatchObject({ passes: 0, shots: 0, passAccuracy: null });
  });
});
