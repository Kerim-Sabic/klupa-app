import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { decodeEvent } from './schema';
import {
  PENALTY_UNITS,
  UNPLACED_SHOT_UNITS,
  inBox,
  mirror,
  shotUnits,
  thirdOf,
  toCommon,
} from './frame';

// Positions in the files are whole percent, so the property is exact on integers.
const percent = fc.integer({ min: 0, max: 100 });
const point = fc.record({ x: percent, y: percent });

describe('frames', () => {
  it('mirroring is an involution', () => {
    fc.assert(
      fc.property(point, (p) => {
        expect(mirror(mirror(p))).toEqual(p);
      }),
    );
  });

  it('keeps home as it is and turns away half a circle', () => {
    fc.assert(
      fc.property(point, (p) => {
        expect(toCommon(p, 0)).toEqual(p);
        expect(toCommon(p, 1)).toEqual(mirror(p));
        expect(toCommon(toCommon(p, 1), 1)).toEqual(p);
      }),
    );
  });

  it('finds the penalty area and the thirds', () => {
    expect(inBox({ x: 90, y: 50 })).toBe(true);
    expect(inBox({ x: 83, y: 50 })).toBe(false);
    expect(inBox({ x: 90, y: 10 })).toBe(false);
    expect(inBox({ x: 90, y: 90 })).toBe(false);
    expect([10, 50, 70].map(thirdOf)).toEqual(['defensive', 'middle', 'attacking']);
  });
});

describe('shotUnits', () => {
  it('fixes a penalty, models a placed shot and falls back for an unplaced one', () => {
    expect(shotUnits(decodeEvent([1, 0, 0, 0, 1, 89, 50, -1, -1, 16], 0))).toBe(PENALTY_UNITS);
    expect(shotUnits(decodeEvent([1, 0, 0, 0, 1, -1, -1, -1, -1, 0], 0))).toBe(UNPLACED_SHOT_UNITS);
    const close = shotUnits(decodeEvent([1, 0, 0, 0, 1, 95, 50, -1, -1, 0], 0));
    const far = shotUnits(decodeEvent([1, 0, 0, 0, 1, 70, 50, -1, -1, 0], 0));
    const header = shotUnits(decodeEvent([1, 0, 0, 0, 1, 95, 50, -1, -1, 4], 0));
    expect(close).toBeGreaterThan(far);
    expect(header).toBeLessThan(close);
  });
});
