import { describe, expect, it } from 'vitest';
import {
  AGE_GROUPS,
  DRILLS,
  EQUIPMENT,
  FOCUS_KEYS,
  PITCH_AREAS,
  type Drill,
  type LocalizedText,
} from './index';

const texts = (drill: Drill): readonly LocalizedText[] => [
  drill.name,
  drill.summary,
  drill.setup,
  ...drill.coachingPoints,
  drill.easier,
  drill.harder,
];

/** "Works for" in the coverage rule: every squad of 8-16 aged u11-u15 on a half pitch. */
const coversCoreSquad = (drill: Drill): boolean =>
  drill.minPlayers <= 8 &&
  drill.maxPlayers >= 16 &&
  PITCH_AREAS.indexOf(drill.minArea) <= PITCH_AREAS.indexOf('half') &&
  (['u11', 'u13', 'u15'] as const).every((age) => drill.ageGroups.includes(age));

describe('drill library', () => {
  it('has 24 drills with unique kebab-case keys', () => {
    expect(DRILLS).toHaveLength(24);
    const keys = DRILLS.map((drill) => drill.key);
    expect(new Set(keys).size).toBe(keys.length);
    keys.forEach((key) => {
      expect(key).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    });
  });

  it('has every text in both languages, short enough for a phone screen', () => {
    DRILLS.forEach((drill) => {
      texts(drill).forEach((text) => {
        expect(text.bs.trim(), drill.key).not.toBe('');
        expect(text.en.trim(), drill.key).not.toBe('');
        expect(text.bs.length, drill.key).toBeLessThanOrEqual(300);
        expect(text.en.length, drill.key).toBeLessThanOrEqual(300);
      });
    });
  });

  it('keeps structured fields inside their vocabularies', () => {
    DRILLS.forEach((drill) => {
      expect(drill.coachingPoints.length).toBeGreaterThanOrEqual(2);
      expect(drill.coachingPoints.length).toBeLessThanOrEqual(3);
      expect(drill.focus.length).toBeGreaterThanOrEqual(1);
      expect(drill.focus.length).toBeLessThanOrEqual(2);
      expect(new Set(drill.focus).size).toBe(drill.focus.length);
      expect(drill.focus.every((focus) => FOCUS_KEYS.includes(focus))).toBe(true);
      expect(drill.equipment.every((item) => EQUIPMENT.includes(item))).toBe(true);
      expect(drill.ageGroups.length).toBeGreaterThan(0);
      expect(drill.ageGroups.every((age) => AGE_GROUPS.includes(age))).toBe(true);
      expect(PITCH_AREAS).toContain(drill.minArea);
    });
  });

  it('has sane numbers: player range, whole minutes, positive rep estimate', () => {
    DRILLS.forEach((drill) => {
      expect(Number.isInteger(drill.minPlayers)).toBe(true);
      expect(Number.isInteger(drill.maxPlayers)).toBe(true);
      expect(drill.minPlayers).toBeGreaterThanOrEqual(1);
      expect(drill.minPlayers).toBeLessThanOrEqual(drill.maxPlayers);
      expect(Number.isInteger(drill.minutes)).toBe(true);
      expect(drill.minutes).toBeGreaterThanOrEqual(5);
      expect(drill.minutes).toBeLessThanOrEqual(30);
      expect(drill.repsPerPlayerMinute).toBeGreaterThan(0);
    });
  });

  it.each(FOCUS_KEYS)('covers %s for u11-u15, 8-16 players, half pitch', (focus) => {
    const usable = DRILLS.filter((drill) => drill.focus.includes(focus) && coversCoreSquad(drill));
    const count = (phase: Drill['phase']): number =>
      usable.filter((drill) => drill.phase === phase).length;
    expect(count('warmup')).toBeGreaterThanOrEqual(1);
    expect(count('main')).toBeGreaterThanOrEqual(2);
    expect(count('game')).toBeGreaterThanOrEqual(1);
  });

  it('orders pitch areas and age groups small to large', () => {
    expect(PITCH_AREAS).toEqual(['quarter', 'half', 'full']);
    expect(AGE_GROUPS[0]).toBe('u7');
    expect(AGE_GROUPS.at(-1)).toBe('senior');
  });
});
