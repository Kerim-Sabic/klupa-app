import { describe, expect, it, vi } from 'vitest';
import {
  ankleIndex,
  drawSkeleton,
  drawTrail,
  imageToCanvas,
  isKickingBone,
  sideViewBounds,
  sideViewProjector,
  trailRange,
} from './draw';
import { formatMeasurement, formatMegabytes, formatNumber, formatSeconds } from './format';
import { POSE_BONES } from './skeleton';
import { partnerIndex, synthesizeKick } from './synthetic';
import { mirrorFrames } from './testFrames';

const colors = {
  ink: '#000',
  inkSoft: '#111',
  line: '#222',
  pitch: '#0f0',
  amber: '#fa0',
  clay: '#f00',
  raised: '#fff',
  paper: '#eee',
  home: '#00f',
};

function fakeContext() {
  const strokes: string[] = [];
  const ctx = {
    lineCap: '',
    lineJoin: '',
    globalAlpha: 1,
    lineWidth: 1,
    strokeStyle: '',
    fillStyle: '',
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(() => strokes.push(ctx.strokeStyle)),
  };
  return { ctx, strokes };
}

describe('drawing helpers', () => {
  it('knows the kicking leg', () => {
    expect(isKickingBone(24, 26, 'right')).toBe(true);
    expect(isKickingBone(23, 25, 'right')).toBe(false);
    expect(isKickingBone(23, 25, 'left')).toBe(true);
    expect(isKickingBone(24, 26, null)).toBe(false);
    expect(ankleIndex('left')).toBe(27);
    expect(ankleIndex('right')).toBe(28);
  });

  it('projects a side view on one scale, centred in the box', () => {
    const bounds = sideViewBounds([
      [
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 2, z: 0 },
      ],
    ]);
    expect(bounds).toEqual({ minX: 0, maxX: 1, minY: 0, maxY: 2 });
    const project = sideViewProjector(bounds, 200, 200, 0);
    expect(project({ x: 0, y: 0, z: 0 })).toEqual({ x: 50, y: 0 });
    expect(project({ x: 1, y: 2, z: 0 })).toEqual({ x: 150, y: 200 });
  });

  it('maps image landmarks to pixels and bounds the trail by the moment shown', () => {
    expect(imageToCanvas([{ x: 0.5, y: 0.25, visibility: 1 }], 200, 100)).toEqual([
      { x: 100, y: 25, visibility: 1 },
    ]);
    expect(trailRange(40, 46, 52, 44)).toEqual([34, 44]);
    expect(trailRange(40, 46, null, 100)).toEqual([34, 52]);
    expect(trailRange(2, 5, 9, 100)).toEqual([0, 9]);
  });

  it('draws each bone twice (halo, then colour) with the kicking leg in pitch green', () => {
    const { ctx, strokes } = fakeContext();
    const points = Array.from({ length: 33 }, (_, i) => ({
      x: i,
      y: i,
      visibility: i === 0 ? 0.2 : 1,
    }));
    drawSkeleton(ctx as unknown as CanvasRenderingContext2D, points, {
      colors,
      foot: 'right',
      lineWidth: 3,
    });
    // Hip to knee, knee to ankle, and the three foot bones.
    expect(strokes.filter((s) => s === colors.pitch)).toHaveLength(5);
    expect(strokes).toHaveLength(POSE_BONES.length * 2 + 1);
    const trail = fakeContext();
    drawTrail(
      trail.ctx as unknown as CanvasRenderingContext2D,
      [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
      '#fa0',
    );
    expect(trail.ctx.fill).toHaveBeenCalledTimes(2);
    expect(trail.ctx.globalAlpha).toBe(1);
  });
});

describe('formatting', () => {
  it('uses the language decimal separator and a real minus sign', () => {
    expect(formatNumber(-0.321, 2, 'bs')).toBe('−0,32');
    expect(formatNumber(1.25, 1, 'en')).toBe('1.3');
    expect(formatNumber(-0.001, 2, 'en')).toBe('0.00');
    expect(formatNumber(2, 1, 'de')).toBe('2.0');
    expect(formatMeasurement({ value: 77.4, unit: 'deg' }, 'en')).toBe('77');
    expect(formatMeasurement({ value: 8.44, unit: 'm/s' }, 'bs')).toBe('8,4');
    expect(formatSeconds(1.3, 'en')).toBe('1.30');
    expect(formatMegabytes(5_777_746, 'bs')).toBe('5,8');
  });
});

describe('synthetic skeleton', () => {
  it('pairs left and right landmarks', () => {
    expect(partnerIndex(0)).toBe(0);
    expect(partnerIndex(1)).toBe(4);
    expect(partnerIndex(6)).toBe(3);
    expect(partnerIndex(7)).toBe(8);
    expect(partnerIndex(28)).toBe(27);
  });

  it('is repeatable and keeps empty frames empty when mirrored', () => {
    expect(synthesizeKick({ noise: 0.01, seed: 3 })).toEqual(
      synthesizeKick({ noise: 0.01, seed: 3 }),
    );
    const [first] = mirrorFrames([{ time: 0, world: null }]);
    expect(first?.world).toBeNull();
  });
});
