import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EQUIPMENT,
  attendanceCounts,
  defaultPlayers,
  initialForm,
  isIsoDate,
  isUuid,
  parseFocus,
  parseMatchId,
  rotationSlots,
  toConstraints,
  toggleEquipment,
  todayIso,
  validateForm,
  type PlannerForm,
} from './constraints';

const form: PlannerForm = {
  focus: 'finishing',
  heldOn: '2026-11-12',
  players: 12,
  minutes: 60,
  area: 'half',
  equipment: DEFAULT_EQUIPMENT,
  floodlit: false,
};

describe('search parameters', () => {
  it('accepts a known focus and drops anything else', () => {
    expect(parseFocus('pressing')).toBe('pressing');
    expect(parseFocus('pressing ')).toBeNull();
    expect(parseFocus('<script>')).toBeNull();
    expect(parseFocus(null)).toBeNull();
  });

  it('accepts only a well-formed match id', () => {
    const id = '22222222-2222-4222-8222-222222222222';
    expect(parseMatchId(id)).toBe(id);
    expect(parseMatchId(id.toUpperCase())).toBe(id.toUpperCase());
    expect(parseMatchId('42')).toBeNull();
    expect(parseMatchId(`${id}x`)).toBeNull();
    expect(parseMatchId(null)).toBeNull();
    expect(isUuid(undefined)).toBe(false);
  });
});

describe('dates', () => {
  it('reads today in local time, not UTC', () => {
    expect(todayIso(new Date(2026, 0, 5, 0, 30))).toBe('2026-01-05');
    expect(todayIso(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31');
  });

  it('accepts real calendar dates only', () => {
    expect(isIsoDate('2026-02-28')).toBe(true);
    expect(isIsoDate('2028-02-29')).toBe(true);
    expect(isIsoDate('2026-02-29')).toBe(false);
    expect(isIsoDate('2026-13-01')).toBe(false);
    expect(isIsoDate('12.11.2026')).toBe(false);
    expect(isIsoDate('')).toBe(false);
  });
});

describe('initialForm', () => {
  it('starts from the squad size, kept inside the stepper range', () => {
    expect(defaultPlayers(0)).toBe(4);
    expect(defaultPlayers(3)).toBe(4);
    expect(defaultPlayers(14)).toBe(14);
    expect(defaultPlayers(45)).toBe(30);
  });

  it('uses the link focus, falling back to the first focus, with the default kit', () => {
    const now = new Date(2026, 10, 12);
    expect(initialForm({ focus: 'build_up', squadSize: 14, now })).toEqual({
      focus: 'build_up',
      heldOn: '2026-11-12',
      players: 14,
      minutes: 60,
      area: 'half',
      equipment: ['balls', 'cones', 'bibs', 'small_goals'],
      floodlit: false,
    });
    expect(initialForm({ focus: 'nonsense', squadSize: 9, now }).focus).toBe(
      'receiving_under_pressure',
    );
  });
});

describe('validateForm', () => {
  it('has no errors for a good form', () => {
    expect(validateForm(form)).toEqual({});
  });

  it('names each field that is wrong', () => {
    const bad = {
      ...form,
      focus: 'x',
      heldOn: '2026-02-31',
      players: 3.5,
      minutes: 50,
      area: 'pool',
      equipment: ['balls', 'rope'],
    } as unknown as PlannerForm;
    expect(validateForm(bad)).toEqual({
      focus: 'UNKNOWN_FOCUS',
      heldOn: 'INVALID_DATE',
      players: 'INVALID_PLAYERS',
      minutes: 'INVALID_MINUTES',
      area: 'UNKNOWN_AREA',
      equipment: 'UNKNOWN_EQUIPMENT',
    });
  });

  it('keeps players within 4 to 30', () => {
    expect(validateForm({ ...form, players: 3 }).players).toBe('INVALID_PLAYERS');
    expect(validateForm({ ...form, players: 31 }).players).toBe('INVALID_PLAYERS');
    expect(validateForm({ ...form, players: 4 }).players).toBeUndefined();
    expect(validateForm({ ...form, players: 30 }).players).toBeUndefined();
  });
});

describe('planner inputs', () => {
  it('builds constraints with the club age group', () => {
    expect(toConstraints(form, 'u11')).toEqual({
      focus: 'finishing',
      players: 12,
      minutes: 60,
      area: 'half',
      ageGroup: 'u11',
      equipment: ['balls', 'cones', 'bibs', 'small_goals'],
    });
  });

  it('plans for the expected turnout and two and four fewer, never below one', () => {
    expect(attendanceCounts(12)).toEqual([12, 10, 8]);
    expect(attendanceCounts(5)).toEqual([5, 3, 1]);
    expect(attendanceCounts(4)).toEqual([4, 2]);
    expect(attendanceCounts(2)).toEqual([2]);
  });

  it('rotates a third of the group, at least two at a time', () => {
    expect(rotationSlots(4)).toBe(2);
    expect(rotationSlots(9)).toBe(3);
    expect(rotationSlots(10)).toBe(3);
    expect(rotationSlots(30)).toBe(10);
  });

  it('toggles equipment and keeps the library order', () => {
    expect(toggleEquipment(['balls', 'cones'], 'bibs')).toEqual(['balls', 'cones', 'bibs']);
    expect(toggleEquipment(['cones'], 'balls')).toEqual(['balls', 'cones']);
    expect(toggleEquipment(['balls', 'cones'], 'cones')).toEqual(['balls']);
  });
});
