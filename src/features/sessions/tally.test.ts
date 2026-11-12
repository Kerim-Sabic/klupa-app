import { describe, expect, it } from 'vitest';
import { dropRow, putRow } from './cache';
import { summarize } from './summary';
import {
  EMPTY_TALLY,
  EXPECTED,
  markStatus,
  setAttempts,
  setMinutes,
  setSuccesses,
  toggleEffort,
  type AttendanceValue,
  type Tally,
} from './tally';

describe('attempts and successes', () => {
  it('counts up and down within 0 to 500', () => {
    expect(setAttempts(EMPTY_TALLY, 1)).toEqual({ attempts: 1, successes: 0 });
    expect(setAttempts(EMPTY_TALLY, -1)).toEqual(EMPTY_TALLY);
    expect(setAttempts(EMPTY_TALLY, 900).attempts).toBe(500);
  });

  it('never lets successes pass attempts', () => {
    const tally: Tally = { attempts: 3, successes: 3 };
    expect(setSuccesses(tally, 4)).toEqual(tally);
    expect(setSuccesses(EMPTY_TALLY, 1)).toEqual(EMPTY_TALLY);
    expect(setSuccesses(tally, -2)).toEqual({ attempts: 3, successes: 0 });
  });

  it('brings successes down when attempts are taken back below them', () => {
    expect(setAttempts({ attempts: 4, successes: 4 }, 3)).toEqual({ attempts: 3, successes: 3 });
    expect(setAttempts({ attempts: 4, successes: 1 }, 3)).toEqual({ attempts: 3, successes: 1 });
  });
});

describe('attendance changes', () => {
  it('gives a present player the whole session unless minutes were already set', () => {
    expect(markStatus(EXPECTED, 'present', 60)).toEqual({
      status: 'present',
      minutes: 60,
      rpe: null,
    });
    const set: AttendanceValue = { status: 'absent', minutes: 35, rpe: 4 };
    expect(markStatus(set, 'present', 60)).toEqual({ status: 'present', minutes: 35, rpe: 4 });
  });

  it('clears minutes and effort when a player is absent', () => {
    expect(markStatus({ status: 'present', minutes: 60, rpe: 7 }, 'absent', 60)).toEqual({
      status: 'absent',
      minutes: null,
      rpe: null,
    });
  });

  it('keeps the rest when only the status goes back to expected', () => {
    expect(markStatus({ status: 'present', minutes: 60, rpe: 7 }, 'expected', 60)).toEqual({
      status: 'expected',
      minutes: 60,
      rpe: 7,
    });
  });

  it('keeps minutes within 0 to 180', () => {
    const present: AttendanceValue = { status: 'present', minutes: 60, rpe: null };
    expect(setMinutes(present, 65).minutes).toBe(65);
    expect(setMinutes(present, -5).minutes).toBe(0);
    expect(setMinutes(present, 500).minutes).toBe(180);
  });

  it('sets an effort rating, and clears it when tapped again', () => {
    const present: AttendanceValue = { status: 'present', minutes: 60, rpe: null };
    const rated = toggleEffort(present, 7);
    expect(rated.rpe).toBe(7);
    expect(toggleEffort(rated, 7).rpe).toBeNull();
    expect(toggleEffort(rated, 3).rpe).toBe(3);
  });
});

describe('summarize', () => {
  const attendance = new Map<string, AttendanceValue>([
    ['a', { status: 'present', minutes: 60, rpe: 6 }],
    ['b', { status: 'present', minutes: 60, rpe: 7 }],
    ['c', { status: 'present', minutes: 45, rpe: null }],
    ['d', { status: 'absent', minutes: null, rpe: null }],
  ]);
  const tallies = new Map<string, Tally>([
    ['a', { attempts: 5, successes: 3 }],
    ['b', { attempts: 0, successes: 0 }],
    ['d', { attempts: 9, successes: 9 }],
  ]);

  it('counts present, average effort among rated, attempts and who is not observed yet', () => {
    expect(summarize({ playerIds: ['a', 'b', 'c', 'd', 'e'], attendance, tallies })).toEqual({
      present: 3,
      expected: 5,
      averageEffort: 6.5,
      ratedCount: 2,
      // d is absent, so their nine attempts are not summed; c has no row at all.
      totalAttempts: 5,
      notObserved: 2,
    });
  });

  it('has no average before anyone is rated, and nothing to observe before anyone is present', () => {
    expect(summarize({ playerIds: ['x', 'y'], attendance: new Map(), tallies: new Map() })).toEqual(
      {
        present: 0,
        expected: 2,
        averageEffort: null,
        ratedCount: 0,
        totalAttempts: 0,
        notObserved: 0,
      },
    );
  });

  it('rounds the average to one decimal', () => {
    const rated = new Map<string, AttendanceValue>(
      [5, 6, 6].map((rpe, index) => [
        String(index),
        { status: 'present', minutes: 60, rpe } as const,
      ]),
    );
    expect(
      summarize({ playerIds: ['0', '1', '2'], attendance: rated, tallies: new Map() })
        .averageEffort,
    ).toBe(5.7);
  });
});

describe('cached rows', () => {
  const rows = [
    { player_id: 'a', n: 1 },
    { player_id: 'b', n: 2 },
  ];

  it('replaces or adds one player without touching the rest', () => {
    expect(putRow(rows, { player_id: 'b', n: 9 })).toEqual([
      { player_id: 'a', n: 1 },
      { player_id: 'b', n: 9 },
    ]);
    expect(putRow(rows, { player_id: 'c', n: 3 })).toHaveLength(3);
  });

  it('removes one player', () => {
    expect(dropRow(rows, 'a')).toEqual([{ player_id: 'b', n: 2 }]);
  });
});
