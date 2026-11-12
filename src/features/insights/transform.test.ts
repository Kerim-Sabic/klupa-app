import { describe, expect, it } from 'vitest';
import {
  addDays,
  birthQuarterCounts,
  closedMatchMinutes,
  localIsoDate,
  observationTotals,
  presentAttendance,
  squadIds,
  toExposures,
  toLoadEntries,
  toPitchSessions,
  toResourceSettings,
  trainingMinutes,
} from './transform';
import { attendance, observation, player, session, stint } from './testKit';

const squad = squadIds([player(1), player(2), player(3)]);

describe('dates', () => {
  it('reads the local calendar date, padded', () => {
    expect(localIsoDate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(localIsoDate(new Date(2026, 10, 11, 0, 1))).toBe('2026-11-11');
  });

  it('moves a date by whole days across month and year ends', () => {
    expect(addDays('2026-11-09', -7)).toBe('2026-11-02');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
  });
});

describe('closedMatchMinutes', () => {
  it('sums closed stints per player and rounds once to one decimal', () => {
    const { minutes, openStints } = closedMatchMinutes(
      [
        stint('p1', 0, 30),
        stint('p1', 35, 50),
        // 10 s and 20 s: 30 s in total is 0.5 minutes, not 0.2 + 0.3.
        { ...stint('p2', 0, 0), on_seconds: 0, off_seconds: 10 },
        { ...stint('p2', 0, 0), on_seconds: 100, off_seconds: 120 },
      ],
      squad,
    );
    expect(minutes.get('p1')).toBe(45);
    expect(minutes.get('p2')).toBe(0.5);
    expect(minutes.has('p3')).toBe(false);
    expect(openStints).toBe(0);
  });

  it('ignores open stints and counts them', () => {
    const { minutes, openStints } = closedMatchMinutes(
      [stint('p1', 0, 20), stint('p1', 40, null), stint('p2', 10, null)],
      squad,
    );
    expect(minutes.get('p1')).toBe(20);
    expect(minutes.has('p2')).toBe(false);
    expect(openStints).toBe(2);
  });

  it('reads only squad players, so another team or an archived child never leaks in', () => {
    const { minutes, openStints } = closedMatchMinutes(
      [stint('stranger', 0, 90), stint('stranger', 0, null)],
      squad,
    );
    expect(minutes.size).toBe(0);
    expect(openStints).toBe(0);
  });

  it('can be narrowed to some matches', () => {
    const { minutes } = closedMatchMinutes(
      [stint('p1', 0, 30, '2026-11-08'), stint('p1', 0, 45, '2026-10-01')],
      squad,
      (row) => row.matches.played_on >= '2026-11-01',
    );
    expect(minutes.get('p1')).toBe(30);
  });
});

describe('presentAttendance', () => {
  it('keeps present squad members and leaves out absent, expected and cancelled rows', () => {
    const { rows, missingMinutes } = presentAttendance(
      [
        attendance('p1', 's1', '2026-11-02'),
        attendance('p2', 's1', '2026-11-02', { status: 'absent', minutes: null, rpe: null }),
        attendance('p3', 's1', '2026-11-02', { status: 'expected', minutes: null, rpe: null }),
        attendance('p1', 's2', '2026-11-03', { sessionStatus: 'cancelled' }),
        attendance('stranger', 's1', '2026-11-02'),
      ],
      squad,
    );
    expect(rows.map((row) => `${row.player_id}:${row.session_id}`)).toEqual(['p1:s1']);
    expect(missingMinutes).toBe(0);
  });

  it('counts present rows with no minutes instead of guessing them', () => {
    const { rows, missingMinutes } = presentAttendance(
      [
        attendance('p1', 's1', '2026-11-02', { minutes: null }),
        attendance('p2', 's1', '2026-11-02'),
      ],
      squad,
    );
    expect(rows).toHaveLength(1);
    expect(missingMinutes).toBe(1);
  });

  it('sums training minutes per player', () => {
    const { rows } = presentAttendance(
      [
        attendance('p1', 's1', '2026-11-02', { minutes: 60 }),
        attendance('p1', 's2', '2026-11-04', { minutes: 45 }),
        attendance('p2', 's1', '2026-11-02', { minutes: 30 }),
      ],
      squad,
    );
    const totals = trainingMinutes(rows);
    expect(totals.get('p1')).toBe(105);
    expect(totals.get('p2')).toBe(30);
  });
});

describe('observationTotals', () => {
  it('pools skills and counts the sessions in which something was observed', () => {
    const totals = observationTotals(
      [
        observation('p1', 's1', 5, 3),
        observation('p1', 's1', 4, 4),
        observation('p1', 's2', 6, 1),
        observation('p1', 's3', 0, 0),
        observation('p2', 's1', 0, 0),
        observation('stranger', 's1', 9, 9),
      ],
      squad,
    );
    expect(totals.get('p1')).toEqual({ attempts: 15, successes: 8, sessions: 2 });
    expect(totals.get('p2')).toEqual({ attempts: 0, successes: 0, sessions: 0 });
    expect(totals.has('stranger')).toBe(false);
  });
});

describe('toExposures', () => {
  it('gives every squad player one row, with zeros for players with no records', () => {
    const exposures = toExposures(
      [player(1), player(2)],
      new Map([['p1', 40.5]]),
      new Map([['p2', { attempts: 6, successes: 4, sessions: 2 }]]),
    );
    expect(exposures).toEqual([
      { playerId: 'p1', minutes: 40.5, attempts: 0, successes: 0 },
      { playerId: 'p2', minutes: 0, attempts: 6, successes: 4 },
    ]);
  });
});

describe('toLoadEntries', () => {
  it('dates entries by their session, keeps a missing rating as null and marks them sessions', () => {
    const { rows } = presentAttendance(
      [
        attendance('p1', 's1', '2026-11-02', { minutes: 50, rpe: 7 }),
        attendance('p2', 's1', '2026-11-02', { minutes: 50, rpe: null }),
      ],
      squad,
    );
    expect(toLoadEntries(rows)).toEqual([
      { playerId: 'p1', date: '2026-11-02', minutes: 50, rpe: 7, kind: 'session' },
      { playerId: 'p2', date: '2026-11-02', minutes: 50, rpe: null, kind: 'session' },
    ]);
  });
});

describe('birthQuarterCounts', () => {
  it('counts known quarters and skips players without one', () => {
    expect(
      birthQuarterCounts([player(1, 1), player(2, 1), player(3, 4), player(4), player(5, 9)]),
    ).toEqual([2, 0, 0, 1]);
  });
});

describe('toPitchSessions', () => {
  it('uses completed sessions, with attended as the number of present rows', () => {
    const { sessions, withoutAttendance } = toPitchSessions(
      [
        session('s1', '2026-11-02', { area: 'half', duration_minutes: 90, floodlit: true }),
        session('s2', '2026-11-03', { status: 'planned' }),
        session('s3', '2026-11-04', { status: 'cancelled' }),
      ],
      [
        attendance('p1', 's1', '2026-11-02'),
        attendance('p2', 's1', '2026-11-02'),
        attendance('p3', 's1', '2026-11-02', { status: 'absent' }),
        attendance('p1', 's2', '2026-11-03'),
      ],
    );
    expect(sessions).toEqual([
      {
        id: 's1',
        date: '2026-11-02',
        durationMinutes: 90,
        area: 'half',
        attended: 2,
        floodlit: true,
      },
    ]);
    expect(withoutAttendance).toBe(0);
  });

  it('leaves out a completed session nobody was marked present at, and counts it', () => {
    const { sessions, withoutAttendance } = toPitchSessions(
      [session('s1', '2026-11-02'), session('s2', '2026-11-03')],
      [attendance('p1', 's2', '2026-11-03', { status: 'absent' })],
    );
    expect(sessions).toEqual([]);
    expect(withoutAttendance).toBe(2);
  });
});

describe('toResourceSettings', () => {
  it('renames the club factors and keeps unset ones null', () => {
    expect(
      toResourceSettings({ floodlight_kw: 6, tariff_per_kwh: null, grid_kg_co2_per_kwh: 0.4 }),
    ).toEqual({ floodlightKw: 6, tariffPerKwh: null, gridKgCo2PerKwh: 0.4 });
  });
});
