import { describe, expect, it } from 'vitest';
import { mulberry32 } from './seed';
import {
  at,
  daysSinceMonday,
  int,
  pick,
  shiftDate,
  shuffle,
  uuid,
  weighted,
  type Weighted,
} from './seedRandom';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('random helpers', () => {
  it('mulberry32 repeats for a seed and stays in [0, 1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 200; i += 1) {
      const value = a();
      expect(value).toBe(b());
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });

  it('int covers both ends', () => {
    const rng = mulberry32(3);
    const seen = new Set(Array.from({ length: 300 }, () => int(rng, 2, 5)));
    expect([...seen].sort()).toEqual([2, 3, 4, 5]);
  });

  it('pick and at refuse an empty list', () => {
    expect(() => pick(mulberry32(1), [])).toThrow(RangeError);
    expect(() => at([1], 3)).toThrow(/No item at index 3/);
    expect(at(['a', 'b'], 1)).toBe('b');
  });

  it('shuffle keeps every item', () => {
    const items = [1, 2, 3, 4, 5, 6];
    const shuffled = shuffle(mulberry32(8), items);
    expect([...shuffled].sort()).toEqual(items);
    expect(items).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('weighted follows the weights', () => {
    const rng = mulberry32(11);
    const table: Weighted<string> = [
      ['rare', 1],
      ['common', 9],
    ];
    const counts = { rare: 0, common: 0 };
    for (let i = 0; i < 2000; i += 1) {
      const value = weighted(rng, table);
      if (value === 'rare') counts.rare += 1;
      else counts.common += 1;
    }
    expect(counts.rare).toBeGreaterThan(100);
    expect(counts.rare).toBeLessThan(320);
  });

  it('uuid looks like a version 4 identifier', () => {
    const rng = mulberry32(5);
    for (let i = 0; i < 20; i += 1) expect(uuid(rng)).toMatch(UUID);
  });

  it('does calendar arithmetic without time zones', () => {
    expect(shiftDate('2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftDate('2026-12-31', 1)).toBe('2027-01-01');
    expect(daysSinceMonday('2026-11-09')).toBe(0);
    expect(daysSinceMonday('2026-11-12')).toBe(3);
    expect(daysSinceMonday('2026-11-15')).toBe(6);
  });
});
