import { describe, expect, it } from 'vitest';
import { buildRotation } from '../../engine';
import {
  blockRanges,
  findDrill,
  formatDay,
  formatOneDecimal,
  localized,
  turnRange,
} from './format';

describe('format', () => {
  it('finds drills by key and picks the language', () => {
    const drill = findDrill('possession-neutrals');
    expect(drill?.key).toBe('possession-neutrals');
    expect(findDrill('nope')).toBeUndefined();
    if (drill === undefined) return;
    expect(localized(drill.name, 'en')).toBe('Possession 4 v 4 with three neutrals');
    expect(localized(drill.name, 'bs')).toBe('Posjed 4 na 4 uz tri džokera');
    expect(localized(drill.name, 'de')).toBe('Possession 4 v 4 with three neutrals');
  });

  it('writes the day the date says, whatever the time zone', () => {
    expect(formatDay('2026-11-12', 'en')).toBe('Thu, 12 Nov 2026');
    expect(formatDay('2026-11-12', 'bs')).toBe('čet, 12. nov 2026.');
  });

  it('uses the language decimal separator', () => {
    expect(formatOneDecimal(6.5, 'bs')).toBe('6,5');
    expect(formatOneDecimal(6.5, 'en')).toBe('6.5');
    expect(formatOneDecimal(20, 'bs')).toBe('20,0');
  });

  it('lays blocks end to end', () => {
    expect(blockRanges([10, 14, 18, 18])).toEqual([
      { from: 0, to: 10 },
      { from: 10, to: 24 },
      { from: 24, to: 42 },
      { from: 42, to: 60 },
    ]);
    expect(blockRanges([])).toEqual([]);
  });

  it('reads the fewest and most turns from a rotation', () => {
    const ids = ['a', 'b', 'c', 'd', 'e'];
    expect(turnRange(buildRotation(ids, { rounds: 6, slotsPerRound: 2 }))).toEqual({
      low: 2,
      high: 3,
    });
    expect(turnRange(buildRotation(ids, { rounds: 5, slotsPerRound: 2 }))).toEqual({
      low: 2,
      high: 2,
    });
  });
});
