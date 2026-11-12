import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { synthesizeKick } from '../../features/shotlab/synthetic';
import { mirrorFrames } from '../../features/shotlab/testFrames';
import {
  analyseShot,
  assessVisibility,
  jointAngle,
  kneeAngle,
  PoseInputError,
  smoothPoses,
  type MeasurementId,
  type PoseFrame,
  type ShotAnalysis,
  type StrikeFound,
} from '../pose';

function strike(result: ShotAnalysis): StrikeFound {
  if (result.kind !== 'strike') throw new Error(`Expected a strike, got ${JSON.stringify(result)}`);
  return result;
}

function value(result: StrikeFound, id: MeasurementId): number {
  const found = result.measurements.find((m) => m.id === id);
  if (found === undefined) throw new Error(`No ${id}`);
  return found.value;
}

const FPS = 30;
const frameOf = (seconds: number) => Math.round(seconds * FPS);

describe('jointAngle and kneeAngle', () => {
  it('reads a straight limb as 180 degrees and a right angle as 90', () => {
    const o = { x: 0, y: 0, z: 0 };
    expect(jointAngle({ x: 0, y: -1, z: 0 }, o, { x: 0, y: 1, z: 0 })).toBeCloseTo(180);
    expect(jointAngle({ x: 1, y: 0, z: 0 }, o, { x: 0, y: 0, z: 1 })).toBeCloseTo(90);
    expect(jointAngle(o, o, { x: 1, y: 0, z: 0 })).toBe(180);
  });

  it('reads the synthetic knee at the top of the backswing exactly', () => {
    const frames = synthesizeKick({ backswingKnee: 70 });
    const top = frames[frameOf(1.3 - 0.16)]?.world ?? [];
    expect(kneeAngle(top, 'right')).toBeCloseTo(70, 0);
  });
});

describe('analyseShot on a known kick', () => {
  it('finds the right foot, the strike time and the backswing knee', () => {
    const result = strike(analyseShot(synthesizeKick({ backswingKnee: 70 })));
    expect(result.foot).toBe('right');
    expect(Math.abs(result.strikeFrame - frameOf(1.3))).toBeLessThanOrEqual(1);
    expect(Math.abs(result.backswingFrame - frameOf(1.14))).toBeLessThanOrEqual(1);
    expect(value(result, 'kneeAtBackswing')).toBeGreaterThan(65);
    expect(value(result, 'kneeAtBackswing')).toBeLessThan(80);
    expect(value(result, 'kneeAtStrike')).toBeGreaterThan(value(result, 'kneeAtBackswing') + 30);
    expect(value(result, 'swingDuration')).toBeCloseTo(0.16, 1);
    expect(result.confidence).toBeCloseTo(0.95);
    expect(result.footSpeed).toHaveLength(72);
  });

  it('reports every measurement with a unit and the frames it came from', () => {
    const result = strike(analyseShot(synthesizeKick()));
    const ids = result.measurements.map((m) => m.id);
    expect(ids).toEqual([
      'kneeAtBackswing',
      'kneeAtStrike',
      'hipShoulderSeparation',
      'trunkLeanForward',
      'trunkLeanSideways',
      'plantFrontBack',
      'plantSideways',
      'peakFootSpeed',
      'swingDuration',
      'followThroughHeight',
    ]);
    for (const m of result.measurements) {
      expect(Number.isFinite(m.value), m.id).toBe(true);
      expect(m.frames.length, m.id).toBeGreaterThan(0);
    }
    const depth = result.measurements.filter((m) => m.reliesOnDepth).map((m) => m.id);
    expect(depth).toEqual(['hipShoulderSeparation', 'trunkLeanSideways', 'plantSideways']);
  });

  it('recovers plant-foot placement, trunk lean and rotation within tolerance', () => {
    const result = strike(
      analyseShot(
        synthesizeKick({ plantForward: -0.4, plantSide: 0.3, trunkLean: -15, separation: 30 }),
      ),
    );
    expect(value(result, 'plantFrontBack')).toBeCloseTo(-0.4, 1);
    expect(value(result, 'plantSideways')).toBeCloseTo(0.3, 1);
    expect(value(result, 'trunkLeanForward')).toBeCloseTo(-15, -1);
    expect(Math.abs(value(result, 'trunkLeanSideways'))).toBeLessThan(5);
    expect(value(result, 'hipShoulderSeparation')).toBeGreaterThan(20);
    expect(value(result, 'hipShoulderSeparation')).toBeLessThanOrEqual(30.5);
    expect(value(result, 'peakFootSpeed')).toBeGreaterThan(5);
  });

  it('reads a short follow-through and a small backswing', () => {
    const result = strike(analyseShot(synthesizeKick({ followThrough: 30, backswingKnee: 125 })));
    expect(value(result, 'followThroughHeight')).toBeLessThan(-0.35);
    expect(value(result, 'kneeAtBackswing')).toBeGreaterThan(120);
  });

  it('measures a full follow-through near hip height', () => {
    const result = strike(analyseShot(synthesizeKick({ followThrough: 95 })));
    expect(value(result, 'followThroughHeight')).toBeGreaterThan(-0.15);
  });

  it('leaves out the follow-through when the clip ends at the strike', () => {
    const result = strike(analyseShot(synthesizeKick({ duration: 1.38 })));
    expect(result.followThroughFrame).toBeNull();
    expect(result.measurements.some((m) => m.id === 'followThroughHeight')).toBe(false);
  });

  it('refuses a peak on the very last frame: the swing may have been cut off', () => {
    expect(analyseShot(synthesizeKick({ duration: 1.31 }))).toMatchObject({
      kind: 'no-strike',
      reason: 'no-clear-peak',
    });
  });
});

describe('symmetry and robustness', () => {
  it('swaps the kicking foot when the skeleton is mirrored', () => {
    const frames = synthesizeKick();
    expect(strike(analyseShot(frames)).foot).toBe('right');
    const mirrored = strike(analyseShot(mirrorFrames(frames)));
    expect(mirrored.foot).toBe('left');
    expect(value(mirrored, 'kneeAtBackswing')).toBeCloseTo(
      value(strike(analyseShot(frames)), 'kneeAtBackswing'),
      6,
    );
  });

  it('finds a left-footed kick generated as such', () => {
    const result = strike(analyseShot(synthesizeKick({ foot: 'left' })));
    expect(result.foot).toBe('left');
    expect(value(result, 'plantSideways')).toBeCloseTo(0.28, 1);
  });

  it('gives the same answer under bounded noise (property)', () => {
    const clean = strike(analyseShot(synthesizeKick()));
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1_000_000 }),
        fc.double({ min: 0, max: 0.01, noNaN: true }),
        (seed, noise) => {
          const noisy = strike(analyseShot(synthesizeKick({ seed, noise })));
          expect(noisy.foot).toBe(clean.foot);
          expect(Math.abs(noisy.strikeFrame - clean.strikeFrame)).toBeLessThanOrEqual(1);
          expect(
            Math.abs(value(noisy, 'kneeAtBackswing') - value(clean, 'kneeAtBackswing')),
          ).toBeLessThan(6);
        },
      ),
      { numRuns: 60 },
    );
  });

  it('recovers strike time and knee over a range of kicks (property)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.9, max: 1.6, noNaN: true }),
        fc.double({ min: 60, max: 110, noNaN: true }),
        fc.constantFrom<'left' | 'right'>('left', 'right'),
        (strikeTime, backswingKnee, foot) => {
          const result = strike(analyseShot(synthesizeKick({ strikeTime, backswingKnee, foot })));
          expect(result.foot).toBe(foot);
          expect(Math.abs(result.strikeFrame - strikeTime * FPS)).toBeLessThanOrEqual(1.5);
          // Smoothing lifts a sharp minimum a little; within 8 degrees is the promise.
          expect(Math.abs(value(result, 'kneeAtBackswing') - backswingKnee)).toBeLessThan(8);
        },
      ),
      { numRuns: 60 },
    );
  });

  it('works at 60 frames per second too', () => {
    const result = strike(analyseShot(synthesizeKick({ fps: 60 })));
    expect(Math.abs(result.strikeFrame - 78)).toBeLessThanOrEqual(2);
  });
});

describe('honest refusals', () => {
  it('finds no clear strike in a standing figure', () => {
    expect(analyseShot(synthesizeKick({ still: true }))).toMatchObject({
      kind: 'no-strike',
      reason: 'too-slow',
    });
  });

  it('finds no clear strike when two equal swings compete', () => {
    const a = synthesizeKick({ duration: 1.6, strikeTime: 0.8 });
    const twice: PoseFrame[] = [...a, ...a.map((f) => ({ ...f, time: f.time + 1.6 }))];
    expect(analyseShot(twice)).toMatchObject({ kind: 'no-strike', reason: 'no-clear-peak' });
  });

  it('needs a backswing: a fast straight-legged swing is not read as a strike', () => {
    expect(analyseShot(synthesizeKick({ backswingKnee: 172 }))).toMatchObject({
      kind: 'no-strike',
      reason: 'no-backswing',
    });
  });

  it('says the body was not seen well enough instead of measuring', () => {
    expect(analyseShot(synthesizeKick({ visibility: 0.3 }))).toEqual({
      kind: 'not-seen',
      reasons: ['low-visibility'],
      confidence: expect.closeTo(0.3, 5) as number,
    });
    const legsHidden = synthesizeKick().map((f) => ({
      ...f,
      world: f.world?.map((p, i) => (i >= 25 ? { ...p, visibility: 0.1 } : p)) ?? null,
    }));
    expect(assessVisibility(legsHidden).reasons).toEqual(['legs-not-visible']);
    const crowd = synthesizeKick().map((f) => ({ ...f, people: 2 }));
    expect(assessVisibility(crowd).reasons).toEqual(['more-than-one-person']);
    const empty = synthesizeKick().map((f, i) => (i % 2 === 0 ? { ...f, world: null } : f));
    expect(assessVisibility(empty).reasons).toContain('body-not-found');
    expect(assessVisibility(synthesizeKick({ duration: 0.3 })).reasons).toContain('too-few-frames');
  });

  it('rejects malformed input with a typed error', () => {
    const frames = synthesizeKick();
    const [first, second] = frames;
    if (first === undefined || second === undefined) throw new Error('frames');
    expect(() => analyseShot([second, first])).toThrow(PoseInputError);
    expect(() => analyseShot([{ time: 0, world: first.world?.slice(0, 10) ?? null }])).toThrow(
      /33 landmarks/,
    );
  });
});

describe('smoothPoses', () => {
  it('fills missing frames between seen ones and returns nothing for an empty clip', () => {
    const frames = synthesizeKick({ duration: 0.5 });
    const gapped = frames.map((f, i) => (i === 5 ? { ...f, world: null } : f));
    const smoothed = smoothPoses(gapped);
    expect(smoothed).toHaveLength(frames.length);
    expect(smoothed[5]?.[28]?.y).toBeCloseTo(frames[5]?.world?.[28]?.y ?? 0, 1);
    expect(smoothPoses(frames.map((f) => ({ ...f, world: null })))).toEqual([]);
  });
});
