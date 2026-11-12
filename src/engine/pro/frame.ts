import { xgUnits } from '../xg';
import type { Point, ProEvent, TeamIndex } from './schema';

/*
 * Two frames. The provider's own frame is per team: x from the acting team's goal line (0) to
 * the line it attacks (100), y from its left (0) to its right (100). The common frame is one
 * pitch for both teams, drawn landscape: the home team attacks left to right, so its events
 * keep their coordinates and the away team's are turned half a circle.
 */

/** Turn a point half a circle about the centre spot. Applying it twice gives the point back. */
export function mirror(point: Point): Point {
  return { x: 100 - point.x, y: 100 - point.y };
}

/** A point in `team`'s own frame, in the common frame (home attacks left to right). */
export function toCommon(point: Point, team: TeamIndex): Point {
  return team === 0 ? point : mirror(point);
}

/**
 * The penalty area in the provider's percent frame: 16.5 m of 105 m (x from 84) and 40.32 m of
 * 68 m (y from 19 to 81), rounded outwards to the provider's whole percent.
 */
export const BOX = { fromX: 84, fromY: 19, toY: 81 } as const;

export function inBox(point: Point): boolean {
  return point.x >= BOX.fromX && point.y >= BOX.fromY && point.y <= BOX.toY;
}

/** Thirds of the pitch along the line of attack, in the acting team's own frame. */
export type Third = 'defensive' | 'middle' | 'attacking';
export const THIRDS: readonly Third[] = ['defensive', 'middle', 'attacking'];

export function thirdOf(x: number): Third {
  if (x < 100 / 3) return 'defensive';
  if (x < 200 / 3) return 'middle';
  return 'attacking';
}

/** A penalty's chance quality is fixed, as in the momentum research (scale_validation.py). */
export const PENALTY_UNITS = 7600;

/** Used only when a shot has no position, matching the coach's un-placed shot. */
export const UNPLACED_SHOT_UNITS = 700;

/** Chance quality of one shot in 1/10,000 of a goal, exactly as the research computed it. */
export function shotUnits(event: ProEvent): number {
  if (event.penalty) return PENALTY_UNITS;
  if (event.at === null) return UNPLACED_SHOT_UNITS;
  return xgUnits({ x: event.at.x, y: event.at.y, header: event.header, freeKick: event.freeKick });
}
