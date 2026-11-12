import { describe, expect, it } from 'vitest';
import { loadIndex } from '../../test/proFixtures';
import { finalsOf, foldText, groupByStage, matchesTeam, resultNote, stageKey } from './listModel';

const index = loadIndex();

describe('groupByStage', () => {
  it('puts the final first and the groups last, every match once', () => {
    const groups = groupByStage(index.matches, 'wc2018');
    expect(groups.map((g) => g.stage).slice(0, 6)).toEqual([
      'Final',
      'Third place',
      'Semi-finals',
      'Quarter-finals',
      'Round of 16',
      'Group A',
    ]);
    expect(groups.at(-1)?.stage).toBe('Group H');
    expect(groups.reduce((sum, g) => sum + g.matches.length, 0)).toBe(64);
    const euro = groupByStage(index.matches, 'euro2016');
    expect(euro.reduce((sum, g) => sum + g.matches.length, 0)).toBe(51);
    expect(euro.some((g) => g.stage === 'Third place')).toBe(false);
  });

  it('keeps each group in date order and drops groups the search empties', () => {
    for (const group of groupByStage(index.matches, 'wc2018')) {
      const dates = group.matches.map((m) => m.date);
      expect(dates).toEqual([...dates].sort());
    }
    const croatia = groupByStage(index.matches, 'wc2018', 'croat');
    expect(croatia.flatMap((g) => g.matches)).toHaveLength(7);
    expect(groupByStage(index.matches, 'wc2018', 'zzz')).toEqual([]);
  });
});

describe('search', () => {
  it('ignores case and accents', () => {
    expect(foldText('  Türkiye ')).toBe('turkiye');
    const match = { home: 'Côte', away: 'Wales' } as Parameters<typeof matchesTeam>[0];
    expect(matchesTeam(match, 'cote')).toBe(true);
    expect(matchesTeam(match, 'WAL')).toBe(true);
    expect(matchesTeam(match, '')).toBe(true);
    expect(matchesTeam(match, 'spain')).toBe(false);
  });

  it('finds a team by the name the reader sees as well as the name in the data', () => {
    const match = { home: 'France', away: 'Croatia' } as Parameters<typeof matchesTeam>[0];
    const bosnian = (team: string) => (team === 'Croatia' ? 'Hrvatska' : team);
    expect(matchesTeam(match, 'hrvat', bosnian)).toBe(true);
    expect(matchesTeam(match, 'croat', bosnian)).toBe(true);
    expect(matchesTeam(match, 'hrvat')).toBe(false);
    const final = groupByStage(index.matches, 'wc2018', 'hrvatska', bosnian);
    expect(final.flatMap((group) => group.matches).length).toBeGreaterThan(0);
    expect(final).toEqual(groupByStage(index.matches, 'wc2018', 'croatia'));
  });
});

describe('finals and notes', () => {
  it('finds one final per competition, in list order', () => {
    expect(finalsOf(index.matches, index.competitions).map((m) => m.id)).toEqual([
      2058017, 1694440,
    ]);
  });

  it('describes penalties, extra time, or nothing', () => {
    expect(resultNote({ extraTime: true, shootout: [5, 3] })).toEqual({
      kind: 'penalties',
      home: 5,
      away: 3,
    });
    expect(resultNote({ extraTime: true, shootout: null })).toEqual({ kind: 'extraTime' });
    expect(resultNote({ extraTime: false, shootout: null })).toBeNull();
  });

  it('turns stage names into keys', () => {
    expect(stageKey('Final')).toEqual({ key: 'final' });
    expect(stageKey('Group C')).toEqual({ key: 'group', letter: 'C' });
    expect(stageKey('Play-off')).toEqual({ key: 'other', name: 'Play-off' });
  });
});
