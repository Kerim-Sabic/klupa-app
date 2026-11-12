import { describe, expect, it } from 'vitest';
import { buildFairShareModel, buildLoadModel, buildPitchModel, evennessOf } from './models';
import { attendance, observation, player, session, stint } from './testKit';

describe('evennessOf', () => {
  it('turns a Gini coefficient into the three words at the agreed cut-offs', () => {
    expect(evennessOf(0, 90)).toBe('even');
    expect(evennessOf(0.149, 90)).toBe('even');
    expect(evennessOf(0.15, 90)).toBe('somewhat');
    expect(evennessOf(0.299, 90)).toBe('somewhat');
    expect(evennessOf(0.3, 90)).toBe('uneven');
  });

  it('refuses to call nothing "even" when no minutes were recorded', () => {
    expect(evennessOf(0, 0)).toBe('none');
  });
});

const quarters = [1, 1, 1, 1, 1, 2, 3, 3, 4, 4];
const squad = quarters.map((quarter, index) => player(index + 1, quarter));

describe('buildFairShareModel', () => {
  const model = buildFairShareModel({
    players: squad,
    stints: [
      stint('p1', 0, 30),
      stint('p2', 0, 30),
      stint('p3', 10, 25),
      stint('p4', 20, null),
      stint('outsider', 0, 60),
    ],
    attendance: [
      attendance('p1', 's1', '2026-11-02', { minutes: 60 }),
      attendance('p1', 's2', '2026-11-04', { minutes: 30 }),
      attendance('p2', 's1', '2026-11-02', { minutes: null }),
    ],
    observations: [
      observation('p1', 's1', 10, 7),
      observation('p1', 's2', 6, 4),
      observation('p1', 's3', 4, 3),
      observation('p2', 's1', 2, 2),
    ],
  });

  it('counts players with minutes, the evenness in words and who is under-observed', () => {
    expect(model.squadSize).toBe(10);
    expect(model.playersWithMinutes).toBe(3);
    expect(model.totalMinutes).toBe(75);
    expect(model.evenness).toBe('uneven');
    expect(model.underObservedCount).toBe(9);
    expect(model.hasEvidence).toBe(true);
  });

  it('says what was left out', () => {
    expect(model.openStints).toBe(1);
    expect(model.missingMinutes).toBe(1);
  });

  it('lists the second look least-observed first, as a list of who has not had a look', () => {
    const ids = model.secondLook.map((row) => row.playerId);
    expect(ids).toHaveLength(9);
    expect(ids[ids.length - 1]).toBe('p2');
    expect(ids).not.toContain('p1');
    // Ties on attempts and minutes fall back to the id as text, so p10 sorts before p4.
    expect(ids[0]).toBe('p10');
  });

  it('builds the ledger in squad order with signed minutes against an equal share', () => {
    expect(model.ledger.map((row) => row.shirt)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const first = model.ledger[0];
    const idle = model.ledger[9];
    expect(first?.matchMinutes).toBe(30);
    expect(first?.minutesVersusEqual).toBeCloseTo(22.5, 10);
    expect(first?.trainingMinutes).toBe(90);
    expect(first?.sessionsObserved).toBe(3);
    expect(first?.attempts).toBe(20);
    expect(idle?.minutesVersusEqual).toBeCloseTo(-7.5, 10);
    expect(idle?.matchMinutes).toBe(0);
    const total = model.ledger.reduce((sum, row) => sum + row.minutesVersusEqual, 0);
    expect(total).toBeCloseTo(0, 10);
  });

  it('shows two from two with a wide interval around the shrunk rate', () => {
    const twoFromTwo = model.ledger.find((row) => row.playerId === 'p2');
    const watched = model.ledger.find((row) => row.playerId === 'p1');
    expect(twoFromTwo?.rawRate).toBe(1);
    const wide = twoFromTwo?.adjusted?.interval;
    const narrow = watched?.adjusted?.interval;
    expect(twoFromTwo?.adjusted?.point).toBeLessThan(1);
    expect(wide?.upper).toBeGreaterThan(wide?.lower ?? 1);
    expect((wide?.upper ?? 0) - (wide?.lower ?? 0)).toBeGreaterThan(
      (narrow?.upper ?? 0) - (narrow?.lower ?? 0),
    );
  });

  it('runs the relative-age check on the known birth quarters and their minutes', () => {
    expect(model.relativeAge.status).toBe('ready');
    if (model.relativeAge.status !== 'ready') return;
    expect(model.relativeAge.known).toBe(10);
    expect(model.relativeAge.unknown).toBe(0);
    expect(model.relativeAge.result.n).toBe(10);
    // p1, p2 and p4 are Q1; p3 is Q1 as well: 30 + 30 + 15 of 75 minutes (p4 is open, so 0).
    expect(model.relativeAge.minuteShares?.[0]).toBeCloseTo(1, 10);
  });
});

describe('buildFairShareModel edge cases', () => {
  it('has no evidence for a squad with nothing recorded, and no adjusted rates', () => {
    const empty = buildFairShareModel({
      players: [player(1), player(2)],
      stints: [],
      attendance: [],
      observations: [],
    });
    expect(empty.hasEvidence).toBe(false);
    expect(empty.evenness).toBe('none');
    expect(empty.ledger.every((row) => row.adjusted === null)).toBe(true);
    expect(empty.relativeAge).toEqual({ status: 'needs_more', known: 0 });
  });

  it('keeps the point but draws no interval when the squad rate is exactly 0 or 1', () => {
    const allSucceed = buildFairShareModel({
      players: [player(1), player(2)],
      stints: [],
      attendance: [],
      observations: [observation('p1', 's1', 3, 3)],
    });
    expect(allSucceed.ledger[0]?.adjusted?.interval).toBeNull();
    expect(allSucceed.ledger[0]?.adjusted?.point).toBeCloseTo(1, 10);
    const noneSucceed = buildFairShareModel({
      players: [player(1)],
      stints: [],
      attendance: [],
      observations: [observation('p1', 's1', 3, 0)],
    });
    expect(noneSucceed.ledger[0]?.adjusted?.interval).toBeNull();
  });

  it('needs eight birth quarters and tells the coach how many it has', () => {
    const few = buildFairShareModel({
      players: [player(1, 1), player(2, 2), player(3, 3), player(4), player(5)],
      stints: [],
      attendance: [],
      observations: [],
    });
    expect(few.relativeAge).toEqual({ status: 'needs_more', known: 3 });
  });

  it('reports players without a quarter and no minute shares when nobody has played', () => {
    const noMinutes = buildFairShareModel({
      players: [...squad, player(11)],
      stints: [],
      attendance: [],
      observations: [observation('p1', 's1', 1, 1)],
    });
    expect(noMinutes.relativeAge.status).toBe('ready');
    if (noMinutes.relativeAge.status !== 'ready') return;
    expect(noMinutes.relativeAge.unknown).toBe(1);
    expect(noMinutes.relativeAge.minuteShares).toBeNull();
  });
});

describe('buildLoadModel', () => {
  // 2026-11-11 is a Wednesday; its week starts on Monday 2026-11-09.
  const today = '2026-11-11';
  const history = (id: string) => [
    attendance(id, 'w3', '2026-10-20', { minutes: 60, rpe: 5 }),
    attendance(id, 'w2', '2026-10-27', { minutes: 60, rpe: 5 }),
    attendance(id, 'w1', '2026-11-03', { minutes: 60, rpe: 5 }),
  ];
  const model = buildLoadModel({
    players: [player(1), player(2), player(3), player(4), player(5)],
    stints: [
      stint('p1', 0, 40, '2026-11-08'),
      stint('p1', 0, 30, '2026-11-10'),
      stint('p1', 0, null, '2026-11-10'),
    ],
    attendance: [
      ...history('p1'),
      attendance('p1', 'w0', '2026-11-10', { minutes: 90, rpe: 6 }),
      ...history('p2'),
      attendance('p2', 'w0', '2026-11-10', { minutes: 60, rpe: 5 }),
      attendance('p3', 'w0', '2026-11-10', { minutes: 60, rpe: null }),
      attendance('p5', 'w0', '2026-11-10', { minutes: 60, rpe: 5 }),
      attendance('p5', 'x', '2026-11-12', { minutes: 60, rpe: 5 }),
      attendance('p5', 'y', '2026-11-10', { minutes: null, rpe: 5 }),
      attendance('p5', 'z', '2026-11-10', { status: 'absent', minutes: null }),
    ],
    today,
  });

  it('gives each squad player one row with the engine status, including players with no data', () => {
    const statuses = Object.fromEntries(model.rows.map((row) => [row.playerId, row.status]));
    expect(statuses).toEqual({
      p1: 'sharp_increase',
      p2: 'steady',
      p3: 'incomplete',
      p4: 'no_data',
      p5: 'no_baseline',
    });
  });

  it('computes load as minutes times rating and the change against recent weeks', () => {
    const first = model.rows[0];
    expect(first?.load).toBe(540);
    expect(first?.sessions).toBe(1);
    expect(first?.ratio).toBeCloseTo(1.8, 10);
    expect(model.rows[1]?.ratio).toBeCloseTo(1, 10);
    expect(model.rows[2]?.ratio).toBeNull();
    expect(model.rows[3]?.load).toBe(0);
    expect(model.rows[3]?.ratio).toBeNull();
  });

  it('keeps match minutes as this week only, closed stints only, and out of the load', () => {
    expect(model.rows[0]?.matchMinutes).toBe(30);
    expect(model.rows[1]?.matchMinutes).toBe(0);
  });

  it('does not read sessions dated after today and counts present rows without minutes', () => {
    expect(model.rows[4]?.sessions).toBe(1);
    expect(model.missingMinutes).toBe(1);
    expect(model.hasEntries).toBe(true);
  });

  it('totals the last six weeks, oldest first, with zeros for weeks nobody trained', () => {
    expect(model.weeks.map((week) => week.weekStart)).toEqual([
      '2026-10-05',
      '2026-10-12',
      '2026-10-19',
      '2026-10-26',
      '2026-11-02',
      '2026-11-09',
    ]);
    expect(model.weeks.map((week) => week.load)).toEqual([0, 0, 600, 600, 600, 540 + 300 + 300]);
    expect(model.weeks.map((week) => week.players)).toEqual([0, 0, 2, 2, 2, 4]);
  });

  it('has no entries for an empty record', () => {
    const empty = buildLoadModel({ players: [player(1)], stints: [], attendance: [], today });
    expect(empty.hasEntries).toBe(false);
    expect(empty.rows[0]?.status).toBe('no_data');
    expect(empty.weeks.every((week) => week.load === 0)).toBe(true);
  });
});

describe('buildPitchModel', () => {
  const factors = { floodlight_kw: 4, tariff_per_kwh: 0.25, grid_kg_co2_per_kwh: null };
  const present = (count: number, id: string) =>
    Array.from({ length: count }, (_, index) => attendance(`p${String(index)}`, id, '2026-11-02'));

  it('summarises completed sessions and finds the over-booked one', () => {
    const model = buildPitchModel({
      sessions: [
        session('s1', '2026-11-02', { area: 'full', duration_minutes: 60, floodlit: true }),
        session('s2', '2026-11-03', { area: 'half', duration_minutes: 60 }),
        session('s3', '2026-11-04', { status: 'planned' }),
        session('s4', '2026-11-05'),
      ],
      attendance: [...present(10, 's1'), ...present(10, 's2')],
      factors,
    });
    expect(model.sessionCount).toBe(2);
    expect(model.withoutAttendance).toBe(1);
    expect(model.summary.pitchHours).toBeCloseTo(1.5, 10);
    expect(model.summary.floodlitHours).toBe(1);
    expect(model.summary.estimatedKwh).toBe(4);
    expect(model.summary.estimatedCost).toBe(1);
    expect(model.summary.estimatedKgCo2).toBeNull();
    // Ten children fit a half pitch (11), so the full-pitch session could have used half.
    expect(model.summary.rightSizing.sessions.map((row) => row.sessionId)).toEqual(['s1']);
    expect(model.summary.rightSizing.pitchHoursFreed).toBeCloseTo(0.5, 10);
  });

  it('has nothing to summarise without completed sessions that have attendance', () => {
    const model = buildPitchModel({ sessions: [], attendance: [], factors });
    expect(model.sessionCount).toBe(0);
    expect(model.summary.playersPerPitchHour).toBeNull();
  });
});
