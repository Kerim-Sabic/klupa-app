import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  decodeTracking,
  frameAt,
  parseTrackingMeta,
  playerPath,
  spaceControl,
  teamShape,
  type TeamShape,
  type Tracking,
  type TrackingFrame,
  type TrackingMeta,
} from '../tracking';
import { EngineError, type Side } from '../types';
import golden from './tracking-golden.json';

const S = -32768;

function load(name: string): Buffer {
  return readFileSync(join(process.cwd(), 'public', 'data', 'tracking', name));
}

function encode(values: readonly number[]): ArrayBuffer {
  const buffer = new ArrayBuffer(values.length * 2);
  const view = new DataView(buffer);
  for (const [index, value] of values.entries()) view.setInt16(index * 2, value, true);
  return buffer;
}

function codeOf(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    if (error instanceof EngineError) return error.code;
    throw error;
  }
  return 'none';
}

// Synthetic match: slots 0-1 home, 2-3 away, a ball, 4 Hz, two periods (3 and 2 frames).
const synthMeta: TrackingMeta = {
  formatVersion: 1,
  pitch: { lengthMetres: 105, widthMetres: 68 },
  sampleRateHz: 4,
  sentinel: S,
  columns: 5,
  ballColumn: 4,
  roster: (['home', 'home', 'away', 'away'] as const).map((side, slot) => ({
    slot,
    side,
    shirt: 1 + 8 * (slot % 2),
  })),
  periods: [
    { period: 1, startFrame: 0, frameCount: 3, durationSeconds: 0.5 },
    { period: 2, startFrame: 3, frameCount: 2, durationSeconds: 0.25 },
  ],
  bytes: 100,
};
// Per frame, centimetres: home1 x,y; home9 x,y; away1 x,y; away9 x,y; ball x,y.
const synthValues = [
  ...[-4000, 0, -1000, 500, 4000, 0, 1000, -500, 0, 0],
  ...[-4000, 100, S, S, 4000, 100, 1000, -300, 100, 0],
  ...[-3800, 200, -800, 600, 3800, 200, 1200, -300, 200, 0],
  ...[4000, 0, 1000, 500, -4000, 0, -1000, -500, 0, 0],
  ...[4000, 0, 1200, 500, -4000, 0, -1000, -500, 0, 0],
];
const synth = decodeTracking(encode(synthValues), synthMeta);
const realMetaJson: unknown = JSON.parse(load('J03WN1.json').toString('utf-8'));

describe('decoding and validation', () => {
  it('accepts the shipped metadata and rejects broken copies', () => {
    const real = realMetaJson as Record<string, unknown>;
    expect(parseTrackingMeta(real).roster).toHaveLength(29);
    const broken = [
      null,
      { ...real, pitch: 3 },
      { ...real, bytes: 12 },
      { ...real, formatVersion: 2 },
    ];
    for (const meta of broken) expect(codeOf(() => parseTrackingMeta(meta))).toBe('INVALID_EVENT');
  });

  it('rejects inconsistent periods, rosters, sizes and a lone team', () => {
    const first = { period: 1, startFrame: 0, frameCount: 3, durationSeconds: 0.5 };
    const second = synthMeta.periods.slice(1);
    const bad: TrackingMeta[] = [
      { ...synthMeta, periods: [{ ...first, startFrame: 1 }, ...second] },
      { ...synthMeta, periods: [{ ...first, durationSeconds: 9 }, ...second] },
      { ...synthMeta, roster: [...synthMeta.roster].reverse() },
      { ...synthMeta, periods: [], formatVersion: 7 },
    ];
    const decode = (buffer: ArrayBuffer, meta: TrackingMeta): string =>
      codeOf(() => decodeTracking(buffer, meta));
    for (const meta of bad) expect(decode(encode(synthValues), meta)).toBe('INVALID_EVENT');
    expect(decode(encode(synthValues.slice(2)), synthMeta)).toBe('INVALID_EVENT');
    const awayGone = [...synthValues];
    awayGone.splice(4, 4, S, S, S, S);
    expect(decode(encode(awayGone), synthMeta)).toBe('INVALID_EVENT');
  });
});

describe('frameAt', () => {
  const slots = (seconds: number): string =>
    frameAt(synth, 1, seconds)
      .players.map((p) => p.slot)
      .join();
  const xy = (seconds: number, slot: number): string => {
    const found = frameAt(synth, 1, seconds).players.find((p) => p.slot === slot);
    return `${String(found?.x)},${String(found?.y)}`;
  };

  it('reads samples exactly and interpolates linearly between them', () => {
    const exact = frameAt(synth, 1, 0).players.map((p) => `${String(p.x)},${String(p.y)}`);
    expect(exact).toEqual(['-40,0', '-10,5', '40,0', '10,-5']);
    expect([xy(0.125, 0), xy(0.125, 3)]).toEqual(['-40,0.5', '10,-4']);
    expect(frameAt(synth, 1, 0.125).ball).toEqual({ x: 0.5, y: 0 });
  });

  it('never interpolates across a missing sample', () => {
    expect([0.125, 0.25, 0.375, 0.5].map(slots)).toEqual(['0,2,3', '0,2,3', '0,2,3', '0,1,2,3']);
  });

  it('rejects times and periods that were not recorded', () => {
    const bad = [() => frameAt(synth, 1, -0.01), () => frameAt(synth, 1, 0.51)];
    bad.push(
      () => frameAt(synth, 2, 0.26),
      () => frameAt(synth, 1, Number.NaN),
    );
    bad.push(
      () => frameAt(synth, 0, 0),
      () => frameAt(synth, 3, 0),
      () => frameAt(synth, 1.5, 0),
    );
    for (const run of bad) expect(codeOf(run)).toBe('INVALID_GRID');
  });

  it('finds goalkeepers and attack directions from the first frame of each period', () => {
    expect(JSON.stringify(synth.keepers)).toBe('[{"home":0,"away":2},{"home":0,"away":2}]');
    expect(JSON.stringify(synth.attack)).toBe('[{"home":1,"away":-1},{"home":-1,"away":1}]');
  });

  it('lets the side furthest from the centre line decide, as when one team kicks off', () => {
    const periods = [{ period: 1, startFrame: 0, frameCount: 1, durationSeconds: 0 }];
    const kickOff = [-4000, 0, -3000, 0, 2600, 0, 200, 0, 0, 0];
    const one = decodeTracking(encode(kickOff), { ...synthMeta, periods, bytes: 20 });
    // Home centroid -35 beats away centroid 14: home defends -x, away defends +x and keeps at x = 26.
    expect(one.attack[0]).toEqual({ home: 1, away: -1 });
    expect(one.keepers[0]).toEqual({ home: 0, away: 2 });
  });
});

type Spec = readonly [Side, number, number];

function frameOf(points: readonly Spec[], keepers = { home: -1, away: -1 }): TrackingFrame {
  const players = points.map(([side, x, y], slot) => ({ slot, side, shirt: slot, x, y }));
  const pitch = { lengthMetres: 105, widthMetres: 68, period: 1, seconds: 0, ball: null };
  return { ...pitch, players, keepers, attack: { home: 1, away: -1 } };
}

const h = (x: number, y: number): Spec => ['home', x, y];
const a = (x: number, y: number): Spec => ['away', x, y];
const wide = (limit: number): fc.Arbitrary<number> =>
  fc.double({ min: -limit, max: limit, noNaN: true });
const coord = (limit: number): fc.Arbitrary<[number, number]> => fc.tuple(wide(limit), wide(33));
const flat = (s: TeamShape | null): number[] =>
  s === null ? [] : [s.count, s.centroidX, s.centroidY, s.width, s.length, s.area];

describe('teamShape', () => {
  it('measures a square exactly and leaves the goalkeeper out', () => {
    const square = [h(-50, 0), h(0, 0), h(10, 0), h(10, 10), h(0, 10)];
    const frame = frameOf(square, { home: 0, away: -1 });
    expect(flat(teamShape(frame, 'home'))).toEqual([4, 5, 5, 10, 10, 100]);
    expect(teamShape(frame, 'away')).toBeNull();
  });

  it('gives zero area for one player and for collinear players, and ignores interior points', () => {
    expect(flat(teamShape(frameOf([a(3, 4)]), 'away'))).toEqual([1, 3, 4, 0, 0, 0]);
    expect(teamShape(frameOf([a(0, 0), a(5, 5), a(10, 10)]), 'away')?.area).toBe(0);
    const triangle = [h(0, 0), h(10, 0), h(0, 10)];
    expect(teamShape(frameOf(triangle), 'home')?.area).toBe(50);
    expect(teamShape(frameOf([...triangle, h(2, 2), h(3, 1)]), 'home')?.area).toBe(50);
  });

  it('obeys geometric laws for random players', () => {
    const squad = fc.array(coord(30), { minLength: 3, maxLength: 12 });
    fc.assert(
      fc.property(squad, coord(30), (raw, shift) => {
        const shapeOf = (points: readonly Spec[]): number[] =>
          flat(teamShape(frameOf(points), 'home'));
        const shape = shapeOf(raw.map(([x, y]) => h(x, y)));
        const moved = shapeOf(raw.map(([x, y]) => h(x + shift[0], y + shift[1])));
        const [, , , width = 0, length = 0, area = -1] = shape;
        expect(area).toBeGreaterThanOrEqual(0);
        expect(area).toBeLessThanOrEqual(width * length + 1e-6);
        expect(moved[5]).toBeCloseTo(area, 6);
      }),
    );
  });
});

describe('spaceControl', () => {
  it('splits the pitch down the middle between one player each', () => {
    const control = spaceControl(frameOf([h(-1, 0), a(1, 0)]));
    expect([control.homeCells, control.awayCells, control.homeShare]).toEqual([336, 336, 0.5]);
    expect([control.owners.length, control.owners[0], control.owners[31]]).toEqual([672, 1, 0]);
  });

  it('gives a lone side every cell and breaks ties towards the lower slot', () => {
    expect(spaceControl(frameOf([a(0, 0)])).awayCells).toBe(672);
    expect(spaceControl(frameOf([h(0, 0), a(0, 0)]), 4, 3).homeCells).toBe(12);
  });

  it('rejects empty frames and impossible grids', () => {
    expect(codeOf(() => spaceControl(frameOf([])))).toBe('INVALID_EVENT');
    const one = frameOf([h(0, 0)]);
    for (const bad of [0, 2.5, -1]) {
      expect(codeOf(() => spaceControl(one, bad, 3))).toBe('INVALID_GRID');
    }
    expect(codeOf(() => spaceControl(one, 3, 0))).toBe('INVALID_GRID');
  });

  it('is unchanged by mirroring the pitch and swaps when the labels swap', () => {
    const squad = fc.array(coord(50), { minLength: 1, maxLength: 6 });
    fc.assert(
      fc.property(squad, squad, (home, away) => {
        const cells = (mirror: number, swap: boolean): number => {
          const mark = (side: Side): Side => (swap === (side === 'home') ? 'away' : 'home');
          const point =
            (side: Side) =>
            ([x, y]: [number, number]): Spec => [mark(side), x * mirror, y];
          const points = [...home.map(point('home')), ...away.map(point('away'))];
          return spaceControl(frameOf(points)).homeCells;
        };
        expect(cells(-1, false)).toBe(cells(1, false));
        expect(cells(1, true)).toBe(672 - cells(1, false));
      }),
    );
  });
});

describe('playerPath', () => {
  const trail = (slot: number, from: number, to: number): string =>
    playerPath(synth, slot, 1, from, to)
      .map((p) => `${String(p.seconds)}${p.connected ? '+' : '.'}`)
      .join(' ');

  it('starts a new line after an absence and never bridges it', () => {
    expect(trail(1, 0, 0.5)).toBe('0. 0.5.');
    expect(trail(0, 0.125, 0.375)).toBe('0.125. 0.25+ 0.375+');
    expect(trail(0, 0.25, 0.25)).toBe('0.25.');
  });

  it('rejects unknown players and backwards or unrecorded ranges', () => {
    const bad = [() => trail(4, 0, 0.25), () => trail(-1, 0, 0.25), () => trail(0, 0.25, 0)];
    for (const run of [...bad, () => trail(0, 0, 0.9)]) expect(codeOf(run)).toBe('INVALID_GRID');
  });
});

describe('shipped match DFL-MAT-J03WN1 (golden, computed in Python)', () => {
  const binary = load('J03WN1.bin');
  const meta = parseTrackingMeta(realMetaJson);
  const tracking: Tracking = decodeTracking(new Uint8Array(binary).buffer, meta);
  const close = (actual: number | undefined, expected: number): void => {
    expect(Math.abs((actual ?? Number.NaN) - expected)).toBeLessThan(1e-6);
  };

  it('is the binary the Python fixture was computed from', () => {
    const digest = createHash('sha256').update(binary).digest('hex');
    expect(digest).toBe(golden.binarySha256);
    expect(digest).toBe((realMetaJson as { sha256: string }).sha256);
  });

  it('finds the same goalkeepers and attack directions', () => {
    for (const expected of golden.periods) {
      expect(tracking.keepers[expected.period - 1]).toEqual(expected.keeperSlots);
      expect(tracking.attack[expected.period - 1]).toEqual(expected.attack);
      expect(meta.roster[expected.keeperSlots.away]?.shirt).toBe(expected.keeperShirts.away);
    }
  });

  it('matches Python on 40 spread frames and 6 edge cases: shape within 1e-6, control exactly', () => {
    expect(golden.frames).toHaveLength(golden.spreadFrames + 6);
    for (const expected of golden.frames) {
      const frame = frameAt(tracking, expected.period, expected.seconds);
      expect(frame.players).toHaveLength(expected.playersOnPitch);
      expect(frame.players.filter((p) => p.side === 'home')).toHaveLength(expected.homePlayers);
      close(frame.ball?.x, expected.ball.x);
      close(frame.ball?.y, expected.ball.y);
      for (const side of ['home', 'away'] as const) {
        const shape = teamShape(frame, side);
        const reference = expected.shapes[side];
        expect(shape?.count).toBe(reference.count);
        for (const key of ['centroidX', 'centroidY', 'width', 'length', 'area'] as const) {
          close(shape?.[key], reference[key]);
        }
      }
      const control = spaceControl(frame, golden.grid.cols, golden.grid.rows);
      expect(control.homeCells).toBe(expected.control.homeCells);
      expect(control.awayCells).toBe(expected.control.awayCells);
      expect(Array.from(control.owners).join('')).toBe(expected.control.owners);
    }
  });

  it('keeps players inside the pitch margin at random instants', () => {
    const instant = fc.tuple(
      fc.integer({ min: 1, max: 2 }),
      fc.double({ min: 0, max: 1, noNaN: true }),
    );
    fc.assert(
      fc.property(instant, ([period, share]) => {
        const duration = meta.periods[period - 1]?.durationSeconds ?? 0;
        const frame = frameAt(tracking, period, share * duration);
        // A substitution instant can leave a few players absent for one sample.
        expect(frame.players.length).toBeGreaterThanOrEqual(15);
        expect(frame.players.every((p) => Math.abs(p.x) <= 57.5 && Math.abs(p.y) <= 39)).toBe(true);
        const control = spaceControl(frame);
        expect(control.homeCells + control.awayCells).toBe(672);
      }),
      { numRuns: 60 },
    );
  });

  it('ends the path of the sent-off home player when he leaves the pitch', () => {
    const slot = meta.roster.find((r) => r.side === 'home' && r.shirt === 21)?.slot ?? -1;
    const path = playerPath(tracking, slot, 1, 0, 700);
    expect(path.length).toBeGreaterThan(100);
    expect(path[path.length - 1]?.seconds ?? 700).toBeLessThan(430);
    expect(path.slice(1).every((p) => p.connected)).toBe(true);
  });
});
