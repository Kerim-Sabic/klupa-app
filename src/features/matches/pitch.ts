import { shotFeatures } from '../../engine';

/**
 * Geometry of the attacking half, drawn in decimetres with the goal at the top: 68 m wide
 * (svg x) by 52.5 m deep (svg y), goal line at y = 0, halfway line at y = 525.
 */
export const HALF_WIDTH = 680;
export const HALF_DEPTH = 525;

/** The drawing has a margin so the goal and a tap just outside a line both stay on the canvas. */
export const VIEW = { x: -24, y: -36, width: HALF_WIDTH + 48, height: HALF_DEPTH + 60 } as const;

export const MARKINGS = {
  penaltyArea: { x: 138.4, y: 0, width: 403.2, height: 165 },
  sixYardBox: { x: 248.4, y: 0, width: 183.2, height: 55 },
  goal: { x: 303.4, y: -20, width: 73.2, height: 20 },
  penaltySpot: { cx: 340, cy: 110 },
  /** The part of the 9.15 m circle around the spot that lies outside the penalty area. */
  arc: 'M266.9 165A91.5 91.5 0 0 0 413.1 165',
  /** Half of the centre circle, on the halfway line. */
  centreArc: 'M248.5 525A91.5 91.5 0 0 1 431.5 525',
} as const;

/**
 * Database convention: `x` is percent of pitch length towards the attacked goal, so the goal
 * line is 100 and halfway is 50; `y` is percent of width, left to right. Whole numbers, because
 * the columns are smallint.
 */
export interface PitchLocation {
  readonly x: number;
  readonly y: number;
}

export const PENALTY_SPOT: PitchLocation = { x: 90, y: 50 };

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** A point in the drawing to a stored location. Taps outside the half snap to its edge. */
export function svgToLocation(sx: number, sy: number): PitchLocation {
  const across = clamp(sx, 0, HALF_WIDTH);
  const depth = clamp(sy, 0, HALF_DEPTH);
  return {
    x: Math.round(100 - (depth / HALF_DEPTH) * 50),
    y: Math.round((across / HALF_WIDTH) * 100),
  };
}

export function locationToSvg(location: PitchLocation): { sx: number; sy: number } {
  return {
    sx: (location.y / 100) * HALF_WIDTH,
    sy: ((100 - location.x) / 50) * HALF_DEPTH,
  };
}

export interface Box {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** A pointer position on screen to a stored location, given where the drawing is on screen. */
export function pointerToLocation(clientX: number, clientY: number, box: Box): PitchLocation {
  if (box.width <= 0 || box.height <= 0) return PENALTY_SPOT;
  const sx = VIEW.x + ((clientX - box.left) / box.width) * VIEW.width;
  const sy = VIEW.y + ((clientY - box.top) / box.height) * VIEW.height;
  return svgToLocation(sx, sy);
}

const NUDGE: Partial<Record<string, { dx: number; dy: number }>> = {
  ArrowUp: { dx: 1, dy: 0 },
  ArrowDown: { dx: -1, dy: 0 },
  ArrowLeft: { dx: 0, dy: -1 },
  ArrowRight: { dx: 0, dy: 1 },
};

/**
 * Keyboard nudging: up moves towards the goal, left and right across. A first press with no
 * marker yet places it on the penalty spot. Returns null for keys that do not nudge.
 */
export function nudge(
  location: PitchLocation | null,
  key: string,
  large = false,
): PitchLocation | null {
  const step = NUDGE[key];
  if (step === undefined) return null;
  if (location === null) return PENALTY_SPOT;
  const size = large ? 5 : 1;
  return {
    x: clamp(location.x + step.dx * size, 50, 100),
    y: clamp(location.y + step.dy * size, 0, 100),
  };
}

/** Straight-line distance to the centre of the goal, in whole metres. */
export function distanceToGoal(location: PitchLocation): number {
  return Math.round(shotFeatures({ ...location, header: false, freeKick: false }).distance);
}
