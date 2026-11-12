import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  AGE_GROUPS,
  DRILLS,
  EQUIPMENT,
  FOCUS_KEYS,
  PITCH_AREAS,
  type Drill,
  type FocusKey,
} from '../../data/drills';
import {
  allocateMinutes,
  buildRotation,
  checkDrill,
  planForAttendance,
  planSession,
  PlannerError,
  type SessionConstraints,
} from '../planner';

const base: SessionConstraints = {
  focus: 'receiving_under_pressure',
  players: 12,
  minutes: 60,
  area: 'half',
  ageGroup: 'u13',
  equipment: EQUIPMENT,
};

const text = { bs: 'x', en: 'x' };
const drill = (key: string, overrides: Partial<Drill> = {}): Drill => ({
  key,
  name: text,
  summary: text,
  setup: text,
  coachingPoints: [text, text],
  easier: text,
  harder: text,
  focus: ['build_up'],
  phase: 'main',
  minPlayers: 2,
  maxPlayers: 20,
  minutes: 15,
  minArea: 'quarter',
  equipment: ['balls'],
  ageGroups: AGE_GROUPS,
  repsPerPlayerMinute: 1,
  ...overrides,
});

const codeOf = (run: () => unknown): string => {
  try {
    run();
  } catch (error) {
    if (error instanceof PlannerError) return error.code;
  }
  return 'NO_THROW';
};

describe('planSession', () => {
  it('builds warm-up, two mains and a game that fill the budget exactly', () => {
    const plan = planSession(DRILLS, base);
    expect(plan.feasible).toBe(true);
    expect(plan.blocks.map((b) => [b.phase, b.drillKey, b.minutes])).toEqual([
      ['warmup', 'rondo-warmup', 10],
      ['main', 'receive-turn-channel', 14],
      ['main', 'possession-neutrals', 18],
      ['game', 'four-goal-game', 18],
    ]);
    expect(plan.totalMinutes).toBe(60);
    expect(plan.blocks[1]?.reasons).toEqual([
      'MATCHES_FOCUS',
      'FITS_PLAYERS',
      'FITS_SPACE',
      'MOST_REPS',
    ]);
    expect(plan.blocks[2]?.reasons).not.toContain('MOST_REPS');
    expect(plan.blocks[1]?.expectedRepsPerPlayer).toBe(30.8);
    expect(plan.expectedRepsPerPlayer).toBe(86.8);
  });

  it('drops the second main under 30 minutes and every main under 20', () => {
    const short = planSession(DRILLS, { ...base, minutes: 25 });
    expect(short.blocks.map((b) => b.phase)).toEqual(['warmup', 'main', 'game']);
    expect(short.totalMinutes).toBe(25);
    const tiny = planSession(DRILLS, { ...base, minutes: 15 });
    expect(tiny.blocks.map((b) => b.phase)).toEqual(['warmup', 'game']);
    expect(tiny.totalMinutes).toBe(15);
  });

  it('is infeasible, not an error, when no main drill fits', () => {
    const plan = planSession(DRILLS, {
      ...base,
      focus: 'finishing',
      area: 'quarter',
      equipment: ['balls', 'cones'],
    });
    expect(plan).toMatchObject({ feasible: false, blocks: [], totalMinutes: 0 });
    expect(plan.rejected.length).toBeGreaterThan(0);
    expect(plan.rejected.every((r) => r.reason === 'NOT_ENOUGH_SPACE')).toBe(true);
    const keys = plan.rejected.map((r) => r.drillKey);
    expect(keys).toEqual([...keys].sort());
  });

  it('lists every infeasible drill for the focus with one reason', () => {
    expect(planSession(DRILLS, base).rejected).toEqual([]);
    const plan = planSession(DRILLS, { ...base, players: 14 });
    expect(plan.rejected).toEqual([
      { drillKey: 'receive-turn-channel', phase: 'main', reason: 'TOO_MANY_PLAYERS' },
    ]);
    expect(plan.blocks[1]?.drillKey).toBe('possession-neutrals');
  });

  it('borrows a warm-up from another focus, and keeps a main when nothing else fits', () => {
    const library = [
      drill('main-a'),
      drill('warm-other', { phase: 'warmup', focus: ['pressing'] }),
      drill('warm-own', { phase: 'warmup', ageGroups: ['senior'] }),
    ];
    const plan = planSession(library, { ...base, focus: 'build_up' });
    expect(plan.blocks[0]).toMatchObject({ drillKey: 'warm-other' });
    expect(plan.blocks[0]?.reasons[0]).toBe('OTHER_FOCUS');
    expect(plan.rejected).toEqual([{ drillKey: 'warm-own', phase: 'warmup', reason: 'AGE_GROUP' }]);
    const lone = planSession([drill('main-a')], { ...base, focus: 'build_up', minutes: 12 });
    expect(lone.blocks).toEqual([expect.objectContaining({ drillKey: 'main-a', minutes: 12 })]);
  });

  it('rejects invalid input with stable codes', () => {
    const bad = (patch: Partial<SessionConstraints>): string =>
      codeOf(() => planSession(DRILLS, { ...base, ...patch }));
    expect(bad({ players: 0 })).toBe('INVALID_PLAYERS');
    expect(bad({ players: 2.5 })).toBe('INVALID_PLAYERS');
    expect(bad({ players: 61 })).toBe('INVALID_PLAYERS');
    expect(bad({ minutes: 9 })).toBe('INVALID_MINUTES');
    expect(bad({ minutes: 241 })).toBe('INVALID_MINUTES');
    expect(bad({ focus: 'heading' as unknown as FocusKey })).toBe('UNKNOWN_FOCUS');
    expect(bad({ area: 'car_park' as unknown as SessionConstraints['area'] })).toBe('UNKNOWN_AREA');
    expect(bad({ ageGroup: 'u5' as unknown as SessionConstraints['ageGroup'] })).toBe(
      'UNKNOWN_AGE_GROUP',
    );
    expect(bad({ equipment: ['ladder' as unknown as 'balls'] })).toBe('UNKNOWN_EQUIPMENT');
    const badLibrary = (d: Drill[]): string => codeOf(() => planSession(d, base));
    expect(badLibrary([drill('a'), drill('a')])).toBe('INVALID_DRILL');
    expect(badLibrary([drill('a', { minPlayers: 9, maxPlayers: 8 })])).toBe('INVALID_DRILL');
    expect(badLibrary([drill('a', { minutes: 0 })])).toBe('INVALID_DRILL');
    expect(badLibrary([drill('a', { repsPerPlayerMinute: -1 })])).toBe('INVALID_DRILL');
  });
});

describe('checkDrill', () => {
  it('returns one reason in a fixed order', () => {
    const d = drill('d', {
      minPlayers: 6,
      maxPlayers: 12,
      minArea: 'half',
      ageGroups: ['u13'],
      equipment: ['balls', 'bibs'],
    });
    expect(checkDrill(d, { ...base, players: 5, area: 'quarter' })).toBe('TOO_FEW_PLAYERS');
    expect(checkDrill(d, { ...base, players: 13 })).toBe('TOO_MANY_PLAYERS');
    expect(checkDrill(d, { ...base, area: 'quarter' })).toBe('NOT_ENOUGH_SPACE');
    expect(checkDrill(d, { ...base, ageGroup: 'u11' })).toBe('AGE_GROUP');
    expect(checkDrill(d, { ...base, equipment: ['balls'] })).toBe('MISSING_EQUIPMENT');
    expect(checkDrill(d, base)).toBeNull();
  });
});

describe('allocateMinutes', () => {
  it('splits by largest remainder and validates input', () => {
    expect(allocateMinutes([10, 15, 20, 20], 60)).toEqual([10, 14, 18, 18]);
    expect(allocateMinutes([1, 1, 1], 3)).toEqual([1, 1, 1]);
    expect(codeOf(() => allocateMinutes([], 10))).toBe('INVALID_MINUTES');
    expect(codeOf(() => allocateMinutes([0, 5], 10))).toBe('INVALID_MINUTES');
    expect(codeOf(() => allocateMinutes([5, 5], 1))).toBe('INVALID_MINUTES');
  });
});

describe('planForAttendance', () => {
  it('reports where the main drill changes as players drop', () => {
    const result = planForAttendance(DRILLS, base, [12, 16, 3, 14, 10, 12, 8]);
    expect(result.scenarios.map((s) => s.players)).toEqual([16, 14, 12, 10, 8, 3]);
    expect(result.switchPoints).toEqual([
      { players: 12, from: 'possession-neutrals', to: 'receive-turn-channel' },
      { players: 3, from: 'receive-turn-channel', to: null },
    ]);
    expect(result.scenarios.at(-1)?.plan.feasible).toBe(false);
  });

  it('needs at least one count', () => {
    expect(codeOf(() => planForAttendance(DRILLS, base, []))).toBe('INVALID_ATTENDANCE');
  });
});

describe('buildRotation', () => {
  it('serves priority players first and spreads turns evenly', () => {
    const rotation = buildRotation(['p1', 'p2', 'p3', 'p4', 'p5'], {
      rounds: 3,
      slotsPerRound: 2,
      priority: ['p4'],
    });
    expect(rotation.rounds).toEqual([
      ['p4', 'p1'],
      ['p2', 'p3'],
      ['p5', 'p4'],
    ]);
    expect(rotation.turns.map((t) => t.turns)).toEqual([1, 1, 1, 2, 1]);
  });

  it('caps slots at the squad size and works without a priority list', () => {
    const rotation = buildRotation(['a', 'b'], { rounds: 2, slotsPerRound: 5 });
    expect(rotation.rounds).toEqual([
      ['a', 'b'],
      ['a', 'b'],
    ]);
  });

  it('rejects bad input', () => {
    const bad = (ids: string[], options: Parameters<typeof buildRotation>[1]): string =>
      codeOf(() => buildRotation(ids, options));
    const ok = { rounds: 2, slotsPerRound: 1 };
    expect(bad([], ok)).toBe('INVALID_ROTATION');
    expect(bad(['a', 'a'], ok)).toBe('INVALID_ROTATION');
    expect(bad([''], ok)).toBe('INVALID_ROTATION');
    expect(bad(['a'], { ...ok, priority: ['b'] })).toBe('INVALID_ROTATION');
    expect(bad(['a'], { ...ok, priority: ['a', 'a'] })).toBe('INVALID_ROTATION');
    expect(bad(['a'], { ...ok, rounds: 0 })).toBe('INVALID_ROTATION');
    expect(bad(['a'], { ...ok, slotsPerRound: 1.5 })).toBe('INVALID_ROTATION');
  });
});

const constraintsArb: fc.Arbitrary<SessionConstraints> = fc.record({
  focus: fc.constantFrom(...FOCUS_KEYS),
  players: fc.integer({ min: 1, max: 30 }),
  minutes: fc.integer({ min: 10, max: 240 }),
  area: fc.constantFrom(...PITCH_AREAS),
  ageGroup: fc.constantFrom(...AGE_GROUPS),
  equipment: fc.subarray([...EQUIPMENT]),
});

describe('planner properties', () => {
  it('never exceeds the budget and only uses feasible drills', () => {
    fc.assert(
      fc.property(constraintsArb, (c) => {
        const plan = planSession(DRILLS, c);
        const sum = plan.blocks.reduce((total, b) => total + b.minutes, 0);
        expect(sum).toBe(plan.totalMinutes);
        expect(sum).toBeLessThanOrEqual(c.minutes);
        expect(plan.blocks.every((b) => b.minutes >= 1)).toBe(true);
        plan.blocks.forEach((b) => {
          const chosen = DRILLS.find((d) => d.key === b.drillKey);
          expect(chosen && checkDrill(chosen, c)).toBeNull();
        });
        expect(plan.feasible).toBe(plan.blocks.length > 0);
      }),
    );
  });

  it('is deterministic and independent of library order', () => {
    const reversed = [...DRILLS].reverse();
    fc.assert(
      fc.property(constraintsArb, (c) => {
        expect(planSession(DRILLS, c)).toEqual(planSession(DRILLS, c));
        expect(planSession(reversed, c)).toEqual(planSession(DRILLS, c));
      }),
    );
  });

  it('keeps rotation fair for any squad, priority list and shape', () => {
    const input = fc
      .uniqueArray(fc.integer({ min: 1, max: 99 }), { minLength: 1, maxLength: 20 })
      .map((ns) => ns.map((n) => `p${String(n)}`))
      .chain((ids) =>
        fc.tuple(
          fc.constant(ids),
          fc.subarray(ids),
          fc.integer({ min: 1, max: 30 }),
          fc.integer({ min: 1, max: 25 }),
        ),
      );
    fc.assert(
      fc.property(input, ([ids, priority, rounds, slotsPerRound]) => {
        const options = { rounds, slotsPerRound, priority };
        const rotation = buildRotation(ids, options);
        expect(buildRotation(ids, options)).toEqual(rotation);
        const turns = rotation.turns.map((t) => t.turns);
        expect(Math.max(...turns) - Math.min(...turns)).toBeLessThanOrEqual(1);
        const isPriority = new Set(priority);
        const pri = rotation.turns.filter((t) => isPriority.has(t.playerId)).map((t) => t.turns);
        const rest = rotation.turns.filter((t) => !isPriority.has(t.playerId)).map((t) => t.turns);
        if (pri.length > 0 && rest.length > 0) {
          expect(Math.min(...pri)).toBeGreaterThanOrEqual(Math.max(...rest));
        }
        rotation.rounds.forEach((round) => {
          expect(round).toHaveLength(Math.min(slotsPerRound, ids.length));
          expect(new Set(round).size).toBe(round.length);
        });
        expect(turns.reduce((a, b) => a + b, 0)).toBe(rounds * Math.min(slotsPerRound, ids.length));
      }),
    );
  });
});
