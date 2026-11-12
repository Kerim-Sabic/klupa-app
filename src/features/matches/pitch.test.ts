import { describe, expect, it } from 'vitest';
import {
  distanceToGoal,
  HALF_DEPTH,
  HALF_WIDTH,
  locationToSvg,
  nudge,
  PENALTY_SPOT,
  pointerToLocation,
  svgToLocation,
  VIEW,
} from './pitch';

describe('svgToLocation', () => {
  it('puts the goal line at 100 and halfway at 50', () => {
    expect(svgToLocation(HALF_WIDTH / 2, 0)).toEqual({ x: 100, y: 50 });
    expect(svgToLocation(HALF_WIDTH / 2, HALF_DEPTH)).toEqual({ x: 50, y: 50 });
  });

  it('reads width left to right', () => {
    expect(svgToLocation(0, 0).y).toBe(0);
    expect(svgToLocation(HALF_WIDTH, 0).y).toBe(100);
    expect(svgToLocation(170, 0).y).toBe(25);
  });

  it('places the penalty spot 11 m out at about x = 90', () => {
    expect(svgToLocation(340, 110)).toEqual({ x: 90, y: 50 });
  });

  it('snaps taps outside the half to its edge', () => {
    expect(svgToLocation(-20, -30)).toEqual({ x: 100, y: 0 });
    expect(svgToLocation(800, 600)).toEqual({ x: 50, y: 100 });
  });

  it('round-trips through the drawing', () => {
    for (const location of [PENALTY_SPOT, { x: 75, y: 20 }, { x: 100, y: 100 }, { x: 50, y: 0 }]) {
      const { sx, sy } = locationToSvg(location);
      expect(svgToLocation(sx, sy)).toEqual(location);
    }
  });
});

describe('pointerToLocation', () => {
  const box = { left: 10, top: 100, width: VIEW.width / 2, height: VIEW.height / 2 };

  it('maps a screen point through the view box, margins included', () => {
    // Screen point of the penalty spot when the drawing is shown at half size.
    const clientX = box.left + (340 - VIEW.x) / 2;
    const clientY = box.top + (110 - VIEW.y) / 2;
    expect(pointerToLocation(clientX, clientY, box)).toEqual({ x: 90, y: 50 });
  });

  it('maps the top-left corner of the drawing to the corner of the half', () => {
    expect(pointerToLocation(box.left, box.top, box)).toEqual({ x: 100, y: 0 });
  });

  it('falls back to the penalty spot when the drawing has no size', () => {
    expect(pointerToLocation(5, 5, { left: 0, top: 0, width: 0, height: 0 })).toEqual(PENALTY_SPOT);
  });
});

describe('nudge', () => {
  it('starts on the penalty spot', () => {
    expect(nudge(null, 'ArrowUp')).toEqual(PENALTY_SPOT);
  });

  it('moves towards goal, back and across', () => {
    const from = { x: 80, y: 40 };
    expect(nudge(from, 'ArrowUp')).toEqual({ x: 81, y: 40 });
    expect(nudge(from, 'ArrowDown')).toEqual({ x: 79, y: 40 });
    expect(nudge(from, 'ArrowLeft')).toEqual({ x: 80, y: 39 });
    expect(nudge(from, 'ArrowRight', true)).toEqual({ x: 80, y: 45 });
  });

  it('stays inside the half', () => {
    expect(nudge({ x: 100, y: 100 }, 'ArrowUp', true)).toEqual({ x: 100, y: 100 });
    expect(nudge({ x: 51, y: 2 }, 'ArrowDown', true)).toEqual({ x: 50, y: 2 });
    expect(nudge({ x: 51, y: 2 }, 'ArrowLeft', true)).toEqual({ x: 51, y: 0 });
  });

  it('ignores other keys', () => {
    expect(nudge({ x: 80, y: 40 }, 'Enter')).toBeNull();
  });
});

describe('distanceToGoal', () => {
  it('measures to the centre of the goal in metres', () => {
    expect(distanceToGoal(PENALTY_SPOT)).toBe(11);
    expect(distanceToGoal({ x: 50, y: 50 })).toBe(53);
  });
});
