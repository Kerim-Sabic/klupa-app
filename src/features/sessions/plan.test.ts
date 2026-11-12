import { describe, expect, it } from 'vitest';
import { DRILLS } from '../../data/drills';
import { planSession, type SessionConstraints, type SessionPlan } from '../../engine';
import { DEFAULT_EQUIPMENT, toConstraints, type PlannerForm } from './constraints';
import { buildValues } from './values';
import { planFor } from './plan';
import { describeRejection } from './rejections';
import { describeSwitchPoints } from './switchPoints';

const form: PlannerForm = {
  focus: 'receiving_under_pressure',
  heldOn: '2026-11-12',
  players: 12,
  minutes: 60,
  area: 'half',
  equipment: DEFAULT_EQUIPMENT,
  floodlit: true,
};

const feasible = planSession(DRILLS, toConstraints(form, 'u13'));

describe('describeSwitchPoints', () => {
  it('says which main drill takes over, which none fits, and which becomes possible', () => {
    expect(
      describeSwitchPoints([
        { players: 17, from: null, to: 'pressure-box' },
        { players: 15, from: 'pressure-box', to: 'possession-neutrals' },
        { players: 2, from: 'possession-neutrals', to: null },
      ]),
    ).toEqual([
      { key: 'sessions.fewer.appears', count: 17, drillKey: 'pressure-box' },
      { key: 'sessions.fewer.change', count: 15, drillKey: 'possession-neutrals' },
      { key: 'sessions.fewer.none', count: 2, drillKey: null },
    ]);
  });

  it('returns nothing when the plan never changes', () => {
    expect(describeSwitchPoints([])).toEqual([]);
  });
});

describe('describeRejection', () => {
  const constraints: SessionConstraints = { ...toConstraints(form, 'u13'), equipment: ['cones'] };
  const rejectedFor = (plan: SessionPlan, drillKey: string) => {
    const found = plan.rejected.find((entry) => entry.drillKey === drillKey);
    if (found === undefined) throw new Error(`${drillKey} was not rejected`);
    return found;
  };
  const drillOf = (key: string) => {
    const drill = DRILLS.find((entry) => entry.key === key);
    if (drill === undefined) throw new Error(`${key} is not in the library`);
    return drill;
  };

  it('names the equipment that is missing', () => {
    const plan = planSession(DRILLS, constraints);
    const message = describeRejection(
      rejectedFor(plan, 'possession-neutrals'),
      drillOf('possession-neutrals'),
      constraints,
    );
    expect(message).toEqual({
      key: 'sessions.rejection.MISSING_EQUIPMENT',
      missing: ['balls', 'bibs'],
    });
  });

  it.each(['TOO_FEW_PLAYERS', 'TOO_MANY_PLAYERS', 'NOT_ENOUGH_SPACE', 'AGE_GROUP'] as const)(
    'gives the deciding detail for %s',
    (reason) => {
      const drill = drillOf('possession-neutrals');
      const message = describeRejection(
        { drillKey: drill.key, phase: drill.phase, reason },
        drill,
        constraints,
      );
      expect(message.key).toBe(`sessions.rejection.${reason}`);
      if (message.key === 'sessions.rejection.TOO_FEW_PLAYERS') {
        expect(message.count).toBe(drill.minPlayers);
      }
      if (message.key === 'sessions.rejection.TOO_MANY_PLAYERS') {
        expect(message.count).toBe(drill.maxPlayers);
      }
      if (message.key === 'sessions.rejection.NOT_ENOUGH_SPACE') {
        expect(message.area).toBe(drill.minArea);
      }
    },
  );
});

describe('planFor', () => {
  it('plans the expected turnout first, then the smaller ones', () => {
    const plan = planFor(form, 'u13');
    expect(plan?.scenarios.map((scenario) => scenario.players)).toEqual([12, 10, 8]);
    expect(plan?.scenarios[0]?.plan).toEqual(feasible);
  });

  it('refuses a form the planner would reject, but not one with only a bad date', () => {
    expect(planFor({ ...form, players: 3 }, 'u13')).toBeNull();
    expect(planFor({ ...form, heldOn: '' }, 'u13')).not.toBeNull();
  });
});

describe('buildValues', () => {
  const base = { form, plan: feasible, playerIds: ['a', 'b'], sourceMatchId: null };

  it('turns the plan into rows in order, one per block', () => {
    const result = buildValues(base);
    if (!result.ok) throw new Error('expected a values');
    expect(result.values.session).toEqual({
      held_on: '2026-11-12',
      focus: 'receiving_under_pressure',
      duration_minutes: 60,
      area: 'half',
      expected_players: 12,
      floodlit: true,
      source_match_id: null,
    });
    expect(result.values.drills.map((drill) => drill.position)).toEqual([1, 2, 3, 4]);
    expect(result.values.drills.map((drill) => drill.drill_key)).toEqual(
      feasible.blocks.map((block) => block.drillKey),
    );
    expect(result.values.drills.reduce((sum, drill) => sum + drill.minutes, 0)).toBe(60);
    expect(result.values.playerIds).toEqual(['a', 'b']);
  });

  it('carries the source match when there is one', () => {
    const result = buildValues({ ...base, sourceMatchId: 'match-1' });
    expect(result.ok && result.values.session.source_match_id).toBe('match-1');
  });

  it('refuses an invalid form with the reasons', () => {
    expect(buildValues({ ...base, form: { ...form, heldOn: 'soon' } })).toEqual({
      ok: false,
      reason: 'INVALID_FORM',
      errors: { heldOn: 'INVALID_DATE' },
    });
  });

  it('refuses a plan with no main drill', () => {
    const none = planSession(DRILLS, { ...toConstraints(form, 'u13'), equipment: [] });
    expect(buildValues({ ...base, plan: none })).toEqual({ ok: false, reason: 'NOT_FEASIBLE' });
  });

  it('refuses a squad list with duplicates or blanks', () => {
    expect(buildValues({ ...base, playerIds: ['a', 'a'] })).toEqual({
      ok: false,
      reason: 'INVALID_SQUAD',
    });
    expect(buildValues({ ...base, playerIds: [''] })).toEqual({
      ok: false,
      reason: 'INVALID_SQUAD',
    });
  });
});
