import { describe, expect, it } from 'vitest';
import { formatCount, formatDecimal, formatPercent, formatXg } from './format';
import {
  buildNeeds,
  buildRings,
  fairMinutes,
  loadNeed,
  pitchNeed,
  secondLookNeed,
  stageOf,
} from './model';
import { emptyInput, observation, player, present, session, stint, TODAY } from './testData';

const squad = [player('p1', 1), player('p2', 2)];

describe('fairMinutes', () => {
  it('is null until someone has played', () => {
    expect(fairMinutes([])).toBeNull();
    expect(fairMinutes([0, 0, 0])).toBeNull();
  });

  it('is 1 when everyone played the same and falls as minutes concentrate', () => {
    expect(fairMinutes([40, 40, 40])).toBe(1);
    // One of four players has everything: Gini 0.75.
    expect(fairMinutes([0, 0, 0, 90])).toBeCloseTo(0.25, 10);
  });
});

describe('buildRings', () => {
  it('measures fair minutes over the whole squad, zeros included, from closed stints only', () => {
    const rings = buildRings(
      emptyInput({
        players: squad,
        // An open stint and another team's player add nothing.
        stints: [stint('p1', 10), stint('p1', null), stint('elsewhere', 90)],
      }),
    );
    expect(rings.fair).toEqual({ value: 0.5, part: 1, of: 2 });
  });

  it('counts players seen at least five times, and says nothing before anything is observed', () => {
    expect(buildRings(emptyInput({ players: squad })).observed.value).toBeNull();
    const rings = buildRings(
      emptyInput({ players: squad, observations: [observation('p1', 6), observation('p2', 2)] }),
    );
    expect(rings.observed).toEqual({ value: 0.5, part: 1, of: 2 });
  });

  it('shares rated minutes of present training up to today, leaving out cancelled and later sessions', () => {
    const rings = buildRings(
      emptyInput({
        players: squad,
        attendance: [
          present('p1', '2026-11-10', 60, 5),
          present('p2', '2026-11-10', 30, null),
          present('p1', '2026-11-20', 90, null),
          present('p2', '2026-11-09', 45, null, 'cancelled'),
        ],
      }),
    );
    expect(rings.effort.value).toBeCloseTo(60 / 90, 10);
    expect(rings.effort).toMatchObject({ part: 60, of: 90 });
    expect(buildRings(emptyInput({ players: squad })).effort.value).toBeNull();
  });
});

describe('loadNeed', () => {
  const steadyWeeks = ['2026-10-20', '2026-10-27', '2026-11-03'].map((day) =>
    present('p1', day, 60, 5),
  );

  it('flags a sharp rise against the player’s own recent weeks, with the largest ratio', () => {
    const need = loadNeed(
      emptyInput({
        players: squad,
        attendance: [
          ...steadyWeeks,
          present('p1', '2026-11-09', 60, 7),
          present('p1', TODAY, 60, 7),
        ],
      }),
    );
    expect(need).toEqual({ kind: 'load', players: 1, highestRatio: 2.8 });
  });

  it('stays quiet for a steady week or with nothing recorded', () => {
    expect(loadNeed(emptyInput({ players: squad }))).toBeNull();
    expect(
      loadNeed(
        emptyInput({ players: squad, attendance: [...steadyWeeks, present('p1', TODAY, 60, 5)] }),
      ),
    ).toBeNull();
  });
});

describe('secondLookNeed', () => {
  it('waits until something has been observed at all', () => {
    expect(secondLookNeed(emptyInput({ players: squad }))).toBeNull();
  });

  it('counts players with fewer than five observed attempts', () => {
    const input = emptyInput({
      players: squad,
      observations: [observation('p1', 6, 3), observation('p2', 2, 1)],
    });
    expect(secondLookNeed(input)).toEqual({ kind: 'secondLook', players: 1 });
    const everyoneSeen = emptyInput({
      players: squad,
      observations: [observation('p1', 6), observation('p2', 5)],
    });
    expect(secondLookNeed(everyoneSeen)).toBeNull();
  });
});

describe('pitchNeed', () => {
  const six = ['a', 'b', 'c', 'd', 'e', 'f'];

  it('flags completed sessions that would have fitted a smaller area', () => {
    const need = pitchNeed(
      emptyInput({
        sessions: [session('s-2026-11-10', '2026-11-10', 'full')],
        attendance: six.map((id) => present(id, '2026-11-10', 60, null)),
      }),
    );
    expect(need).toMatchObject({ kind: 'pitch', sessions: 1 });
    expect(need?.kind === 'pitch' && need.hoursFreed).toBeGreaterThan(0);
  });

  it('stays quiet without sessions, or when the booking fitted', () => {
    expect(pitchNeed(emptyInput())).toBeNull();
    expect(
      pitchNeed(
        emptyInput({
          sessions: [session('s-2026-11-10', '2026-11-10', 'quarter')],
          attendance: six.map((id) => present(id, '2026-11-10', 60, null)),
        }),
      ),
    ).toBeNull();
  });
});

describe('buildNeeds', () => {
  it('orders wellbeing before fairness and returns nothing when nothing crosses a threshold', () => {
    expect(buildNeeds(emptyInput({ players: squad }))).toEqual([]);
    const needs = buildNeeds(
      emptyInput({
        players: squad,
        observations: [observation('p1', 1)],
        attendance: [
          ...['2026-10-20', '2026-10-27', '2026-11-03'].map((day) => present('p1', day, 60, 5)),
          present('p1', TODAY, 60, 9),
        ],
      }),
    );
    expect(needs.map((need) => need.kind)).toEqual(['load', 'secondLook']);
  });
});

describe('stageOf', () => {
  it('sends an empty demo club to the sample season', () => {
    expect(stageOf({ players: 0, matches: 0, sessions: 0, isDemo: true })).toEqual({
      kind: 'demo-empty',
    });
  });

  it('walks a new club through squad, match and training, highlighting the next step', () => {
    expect(stageOf({ players: 0, matches: 0, sessions: 0, isDemo: false })).toMatchObject({
      kind: 'setup',
      current: 'squad',
    });
    expect(stageOf({ players: 12, matches: 0, sessions: 3, isDemo: false })).toMatchObject({
      kind: 'setup',
      current: 'match',
    });
    expect(stageOf({ players: 12, matches: 1, sessions: 0, isDemo: true })).toEqual({
      kind: 'setup',
      current: 'training',
      steps: [
        { key: 'squad', done: true },
        { key: 'match', done: true },
        { key: 'training', done: false },
      ],
    });
    expect(stageOf({ players: 12, matches: 1, sessions: 1, isDemo: false })).toEqual({
      kind: 'running',
    });
  });
});

describe('format', () => {
  it('writes decimals and percents the way each language expects', () => {
    expect(formatDecimal(2.456, 'en')).toBe('2.5');
    expect(formatDecimal(2.456, 'bs')).toBe('2,5');
    expect(formatDecimal(3, 'bs')).toBe('3');
    expect(formatDecimal(1.25, 'xx', 2)).toBe('1.25');
    expect(formatPercent(0.826, 'en')).toBe('83%');
    expect(formatPercent(0.826, 'bs')).toBe(`83${String.fromCharCode(0x202f)}%`);
    expect(formatXg(1500, 'bs')).toBe('0,15');
    expect(formatCount(2850, 'en')).toBe('2,850');
    expect(formatCount(1234567, 'bs')).toBe('1.234.567');
    expect(formatCount(999, 'bs')).toBe('999');
  });
});
