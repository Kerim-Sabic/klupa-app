import { describe, expect, it } from 'vitest';
import { frameAt, spaceControl } from '../../engine/tracking';
import { createPositions, samplePositions } from './motion';
import { SPACE_COLS, SPACE_ROWS } from './model';
import { spaceInto } from './space';
import { shippedTracking } from './testTracking';

const real = shippedTracking();
const home = Uint8Array.from(real.meta.roster, (entry) => (entry.side === 'home' ? 1 : 0));
const { lengthMetres, widthMetres } = real.meta.pitch;

describe('spaceInto', () => {
  it('gives the engine its own answer at recorded moments, cell for cell', () => {
    const positions = createPositions(real);
    const owners = new Uint8Array(SPACE_COLS * SPACE_ROWS);
    for (const [period, seconds] of [
      [1, 0],
      [1, 600],
      [1, 1801.25],
      [2, 42.5],
    ] as const) {
      samplePositions(real, period, seconds, positions);
      const share = spaceInto(
        positions,
        home,
        SPACE_COLS,
        SPACE_ROWS,
        lengthMetres,
        widthMetres,
        owners,
      );
      const engine = spaceControl(frameAt(real, period, seconds), SPACE_COLS, SPACE_ROWS);
      expect(Array.from(owners)).toEqual(Array.from(engine.owners));
      expect(share).toBeCloseTo(engine.homeShare, 10);
    }
  });

  it('splits an empty pitch down the middle between one player each', () => {
    const positions = { xy: new Float32Array([-20, 0, 20, 0, 0, 0]), present: new Uint8Array(3) };
    positions.present.set([1, 1, 0]);
    const owners = new Uint8Array(8);
    const share = spaceInto(positions, Uint8Array.of(1, 0), 4, 2, 100, 60, owners);
    expect(Array.from(owners)).toEqual([1, 1, 0, 0, 1, 1, 0, 0]);
    expect(share).toBe(0.5);
  });

  it('gives a tie to the lower roster slot and ignores anyone off the pitch', () => {
    const positions = { xy: new Float32Array([-10, 0, 10, 0, 0, 0]), present: new Uint8Array(3) };
    positions.present.set([1, 1, 1]);
    const owners = new Uint8Array(1);
    // One cell centred on the halfway line: both are 10 m away, slot 0 keeps it.
    expect(spaceInto(positions, Uint8Array.of(0, 1), 1, 1, 100, 60, owners)).toBe(0);
    positions.present.set([0, 1, 0]);
    expect(spaceInto(positions, Uint8Array.of(0, 1), 1, 1, 100, 60, owners)).toBe(1);
  });

  it('says nothing, and leaves the grid alone, when nobody is on the pitch', () => {
    const positions = { xy: new Float32Array(6), present: new Uint8Array(3) };
    const owners = Uint8Array.of(7);
    expect(spaceInto(positions, Uint8Array.of(1, 0), 1, 1, 100, 60, owners)).toBeNull();
    expect(owners[0]).toBe(7);
    positions.present[0] = 1;
    expect(spaceInto(positions, Uint8Array.of(1, 0), 0, 1, 100, 60, owners)).toBeNull();
  });
});
