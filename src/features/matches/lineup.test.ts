import { describe, expect, it } from 'vitest';
import {
  lineupSteps,
  carryOver,
  closeAllChanges,
  lineupEntries,
  lineupPeriod,
  openStint,
  playedSeconds,
  toggleChange,
} from './lineup';
import { makePlayer, makeStint } from './testing';

const PERIOD = 25 * 60;

describe('playedSeconds', () => {
  it('adds closed stints and runs an open one to the clock', () => {
    const stints = [
      makeStint({ id: 'a', period: 1, on_seconds: 0, off_seconds: 600 }),
      makeStint({ id: 'b', period: 2, on_seconds: 100, off_seconds: null }),
    ];
    expect(playedSeconds(stints, 'p-1', { period: 2, seconds: 400 }, PERIOD)).toBe(900);
  });

  it('runs a stint left open in an earlier period to the period length', () => {
    const stints = [makeStint({ period: 1, on_seconds: 300 })];
    expect(playedSeconds(stints, 'p-1', { period: 2, seconds: 10 }, PERIOD)).toBe(1200);
  });

  it('counts nothing for a stint in a period that has not started', () => {
    const stints = [makeStint({ period: 1, on_seconds: 0 })];
    expect(playedSeconds(stints, 'p-1', { period: 0, seconds: 0 }, PERIOD)).toBe(0);
  });

  it('only counts the given player', () => {
    const stints = [makeStint({ player_id: 'p-2', off_seconds: 60 })];
    expect(playedSeconds(stints, 'p-1', { period: 1, seconds: 100 }, PERIOD)).toBe(0);
  });
});

describe('lineupPeriod', () => {
  it('edits period 1 before kick-off, the live period during play, nothing in between', () => {
    expect(lineupPeriod('before', 0)).toBe(1);
    expect(lineupPeriod('running', 2)).toBe(2);
    expect(lineupPeriod('paused', 3)).toBe(3);
    expect(lineupPeriod('break', 1)).toBeNull();
    expect(lineupPeriod('over', 2)).toBeNull();
  });
});

describe('toggleChange', () => {
  it('puts a player on at the current clock', () => {
    expect(toggleChange([], 'p-1', 1, 300)).toEqual({
      type: 'insert',
      playerId: 'p-1',
      period: 1,
      onSeconds: 300,
    });
  });

  it('takes a player off by closing their open stint', () => {
    const stints = [makeStint({ id: 's', on_seconds: 100 })];
    expect(toggleChange(stints, 'p-1', 1, 400)).toEqual({
      type: 'close',
      stintId: 's',
      offSeconds: 400,
    });
  });

  it('removes a stint taken off in the same second, which the database could not store', () => {
    const stints = [makeStint({ id: 's', on_seconds: 100 })];
    expect(toggleChange(stints, 'p-1', 1, 100)).toEqual({ type: 'delete', stintId: 's' });
  });

  it('ignores stints of another period', () => {
    const stints = [makeStint({ period: 1 })];
    expect(openStint(stints, 'p-1', 2)).toBeUndefined();
    expect(toggleChange(stints, 'p-1', 2, 0).type).toBe('insert');
  });
});

describe('closeAllChanges and carryOver', () => {
  const stints = [
    makeStint({ id: 'a', player_id: 'p-1', period: 1, on_seconds: 0 }),
    makeStint({ id: 'b', player_id: 'p-2', period: 1, on_seconds: 0, off_seconds: 300 }),
    makeStint({ id: 'c', player_id: 'p-3', period: 1, on_seconds: 1500 }),
    makeStint({ id: 'd', player_id: 'p-4', period: 2, on_seconds: 0 }),
  ];

  it('closes every stint still open in the period at its final clock', () => {
    expect(closeAllChanges(stints, 1, 1500)).toEqual([
      { type: 'close', stintId: 'a', offSeconds: 1500 },
      { type: 'delete', stintId: 'c' },
    ]);
  });

  it('brings back whoever was on at the final whistle', () => {
    const closed = [
      makeStint({ id: 'a', player_id: 'p-1', period: 1, on_seconds: 0, off_seconds: 1500 }),
      makeStint({ id: 'b', player_id: 'p-2', period: 1, on_seconds: 0, off_seconds: 300 }),
      makeStint({ id: 'c', player_id: 'p-3', period: 1, on_seconds: 600 }),
      makeStint({ id: 'e', player_id: 'p-1', period: 1, on_seconds: 0, off_seconds: 1500 }),
    ];
    expect(carryOver(closed, 1, 1500)).toEqual(['p-1', 'p-3']);
  });
});

describe('lineupEntries', () => {
  const players = [makePlayer('p-1', 7), makePlayer('p-2', 3), makePlayer('p-3', 10)];

  it('lists players who have not played first, then by shirt number', () => {
    const stints = [makeStint({ id: 'a', player_id: 'p-2', on_seconds: 0, off_seconds: 90 })];
    const entries = lineupEntries(players, stints, { period: 1, seconds: 120 }, PERIOD, 1);
    expect(entries.map((entry) => [entry.player.id, entry.notPlayed, entry.seconds])).toEqual([
      ['p-1', true, 0],
      ['p-3', true, 0],
      ['p-2', false, 90],
    ]);
  });

  it('marks who is on, and never calls a starter "not played" before kick-off', () => {
    const stints = [makeStint({ player_id: 'p-3', period: 1, on_seconds: 0 })];
    const entries = lineupEntries(players, stints, { period: 0, seconds: 0 }, PERIOD, 1);
    const starter = entries.find((entry) => entry.player.id === 'p-3');
    expect(starter).toMatchObject({ on: true, notPlayed: false, seconds: 0 });
    expect(entries.filter((entry) => entry.on)).toHaveLength(1);
  });

  it('shows nobody as on while the lineup is closed', () => {
    const stints = [makeStint({ player_id: 'p-3', period: 1, on_seconds: 0 })];
    const entries = lineupEntries(players, stints, { period: 1, seconds: 60 }, PERIOD, null);
    expect(entries.some((entry) => entry.on)).toBe(false);
  });
});

describe('lineupSteps', () => {
  it('turns each change into the step the database applies', () => {
    expect(
      lineupSteps([
        { type: 'insert', playerId: 'p-3', period: 2, onSeconds: 0 },
        { type: 'close', stintId: 's-a', offSeconds: 600 },
        { type: 'delete', stintId: 's-b' },
      ]),
    ).toEqual([
      { type: 'on', player: 'p-3', period: 2, on_seconds: 0 },
      { type: 'off', stint: 's-a', off_seconds: 600 },
      { type: 'remove', stint: 's-b' },
    ]);
    expect(lineupSteps([])).toEqual([]);
  });
});
