import { describe, expect, it, vi } from 'vitest';
import {
  css,
  drawOverlay,
  markColour,
  ringDash,
  textOn,
  type OverlayContext,
  type OverlayLayers,
} from './draw';
import type { MarkedPlayer, OverlayFrame } from './model';
import type { Team } from './teams';

/** A stand-in context that records what was drawn, and with which dash and colour. */
function recorder() {
  const strokes: { dash: number[]; style: unknown; width: number; alpha: number }[] = [];
  let dash: number[] = [];
  const ctx = {
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 1,
    lineCap: 'butt',
    globalAlpha: 1,
    font: '',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    beginPath: vi.fn(),
    ellipse: vi.fn(),
    arc: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    fill: vi.fn(),
    fillText: vi.fn(),
    setLineDash: vi.fn((pattern: number[]) => {
      dash = pattern;
    }),
    stroke: vi.fn(() => {
      strokes.push({
        dash,
        style: ctx.strokeStyle,
        width: ctx.lineWidth,
        alpha: ctx.globalAlpha,
      });
    }),
  };
  return { ctx: ctx as unknown as OverlayContext & typeof ctx, strokes };
}

const player = (number: number, team: Team, x: number, trail = 0): MarkedPlayer => ({
  id: number,
  number,
  team,
  box: { x, y: 0.4, w: 0.05, h: 0.2 },
  feet: { x: x + 0.025, y: 0.6 },
  trail: Array.from({ length: trail }, (_, i) => ({ x: x - 0.01 * (trail - 1 - i), y: 0.6 })),
});

const frame = (players: MarkedPlayer[], split = true): OverlayFrame => ({
  players,
  counts: { a: 0, b: 0, none: 0 },
  colours: split ? { a: [220, 40, 50], b: [40, 70, 200] } : { a: null, b: null },
});

const all: OverlayLayers = { rings: true, numbers: true, trails: true };

describe('drawOverlay', () => {
  it('draws a ring at the feet, a number over the head and a fading trail', () => {
    const { ctx, strokes } = recorder();
    drawOverlay(ctx, frame([player(7, 'a', 0.5, 4)]), 800, 450, all);
    // The ring twice: a dark edge, then the team colour on top, both at the feet.
    expect(ctx.ellipse).toHaveBeenCalledTimes(2);
    const [x, y, rx, ry] = ctx.ellipse.mock.calls[1] as number[];
    expect(x).toBeCloseTo(0.525 * 800);
    expect(y).toBeCloseTo(0.6 * 450);
    expect(rx).toBeCloseTo(0.05 * 800 * 0.62);
    expect(ry).toBeLessThan((rx ?? 0) / 2);
    expect(ctx.fillText).toHaveBeenCalledWith('7', expect.closeTo(420), expect.any(Number));
    const [, top] = ctx.arc.mock.calls[0] as number[];
    expect(top).toBeLessThan(0.4 * 450);
    // Three trail segments, each a little stronger than the one before.
    expect(ctx.lineTo).toHaveBeenCalledTimes(3);
    const alphas = strokes.slice(0, 3).map((s) => s.alpha);
    expect(alphas[0]).toBeLessThan(alphas[1] ?? 0);
    expect(alphas[1]).toBeLessThan(alphas[2] ?? 0);
    expect(ctx.globalAlpha).toBe(1);
  });

  it('tells the teams apart by the ring pattern as well as by colour', () => {
    const { ctx, strokes } = recorder();
    drawOverlay(
      ctx,
      frame([player(1, 'a', 0.2), player(2, 'b', 0.5), player(3, 'none', 0.8)]),
      800,
      450,
      { ...all, numbers: false },
    );
    const coloured = strokes.filter((s) => s.style !== 'rgb(0 0 0 / 0.6)');
    expect(coloured.map((s) => s.style)).toEqual([
      'rgb(220 40 50)',
      'rgb(40 70 200)',
      'rgb(255 255 255)',
    ]);
    expect(coloured[0]?.dash).toEqual([]);
    expect(coloured[1]?.dash).toHaveLength(2);
    expect(coloured[2]?.dash).toEqual([2, 5]);
    // The dark edge under each ring is always solid and wider.
    const edges = strokes.filter((s) => s.style === 'rgb(0 0 0 / 0.6)');
    expect(edges).toHaveLength(3);
    expect(edges.every((s) => s.dash.length === 0 && s.width > (coloured[0]?.width ?? 0))).toBe(
      true,
    );
  });

  it('draws only the layers that are switched on', () => {
    const one = frame([player(4, 'b', 0.5, 5)]);
    const none = recorder();
    drawOverlay(none.ctx, one, 400, 300, { rings: false, numbers: false, trails: false });
    expect(none.ctx.ellipse).not.toHaveBeenCalled();
    expect(none.ctx.fillText).not.toHaveBeenCalled();
    expect(none.ctx.lineTo).not.toHaveBeenCalled();
    const numbers = recorder();
    drawOverlay(numbers.ctx, one, 400, 300, { rings: false, numbers: true, trails: false });
    expect(numbers.ctx.fillText).toHaveBeenCalledTimes(1);
    expect(numbers.ctx.ellipse).not.toHaveBeenCalled();
    // A trail of one point is no trail.
    const short = recorder();
    drawOverlay(short.ctx, frame([player(4, 'b', 0.5, 1)]), 400, 300, {
      rings: false,
      numbers: false,
      trails: true,
    });
    expect(short.ctx.lineTo).not.toHaveBeenCalled();
  });

  it('keeps a number on the picture for a player at its top edge, and rings readable when small', () => {
    const { ctx } = recorder();
    const high: MarkedPlayer = { ...player(9, 'a', 0.5), box: { x: 0.5, y: 0, w: 0.004, h: 0.1 } };
    drawOverlay(ctx, frame([high]), 320, 180, all);
    const [, top, size] = ctx.arc.mock.calls[0] as number[];
    expect((top ?? 0) - (size ?? 0)).toBeGreaterThanOrEqual(0);
    const [, , rx] = ctx.ellipse.mock.calls[0] as number[];
    expect(rx).toBe(9);
  });

  it('draws everyone white while the kits cannot be told apart', () => {
    const { ctx, strokes } = recorder();
    drawOverlay(ctx, frame([player(1, 'a', 0.3)], false), 800, 450, all);
    expect(strokes.some((s) => s.style === 'rgb(255 255 255)')).toBe(true);
    expect(ctx.fillStyle).toBe('#101418');
  });
});

describe('colours and patterns', () => {
  it('marks a team in its colour and anyone else in white', () => {
    const colours = { a: [1, 2, 3], b: null } as const;
    expect(markColour('a', colours)).toEqual([1, 2, 3]);
    expect(markColour('b', colours)).toEqual([255, 255, 255]);
    expect(markColour('none', colours)).toEqual([255, 255, 255]);
    expect(css([12.4, 99.6, 255])).toBe('rgb(12 100 255)');
  });

  it('writes dark on light and light on dark', () => {
    expect(textOn([255, 255, 255])).toBe('#101418');
    expect(textOn([240, 220, 60])).toBe('#101418');
    expect(textOn([30, 40, 160])).toBe('#ffffff');
    expect(textOn([200, 30, 40])).toBe('#ffffff');
  });

  it('gives each kind of ring its own pattern', () => {
    expect(ringDash('a', 20)).toEqual([]);
    expect(ringDash('b', 20)).toEqual([10, 6.4]);
    expect(ringDash('none', 20)).toEqual([2, 5]);
  });
});
