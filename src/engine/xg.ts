import xgModelJson from '../data/models/xg.json';
import { EngineError } from './types';

/** Pitch geometry the model was trained on (Wyscout percentages mapped to metres). */
export const PITCH_LENGTH_M = 105;
export const PITCH_WIDTH_M = 68;
export const GOAL_WIDTH_M = 7.32;

/** Weight unit the momentum engine uses for provider xG: 1/10,000 of a goal. */
export const XG_UNITS_PER_GOAL = 10_000;

/**
 * One shot. `x` and `y` are percentages of the pitch (0-100) with the attacked
 * goal at x = 100 and y = 50 on the centre line, as in the Wyscout open data.
 */
export interface ShotInput {
  readonly x: number;
  readonly y: number;
  /** Head or other non-foot body part. */
  readonly header: boolean;
  /** Direct free kick. Penalties are not modelled. */
  readonly freeKick: boolean;
}

/** Every feature the trainer may use; a model lists the subset it needs by name. */
export type ShotFeatures = {
  /** Distance to the goal centre in metres. */
  readonly distance: number;
  /** Opening angle of the 7.32 m goal mouth seen from the shot, in radians. */
  readonly angle: number;
  readonly isHeader: number;
  readonly isFreeKick: number;
  readonly distanceAngle: number;
  readonly distanceSquared: number;
};

/** Exported logistic model. Only the fields that drive the maths are required. */
export interface XgModel {
  readonly name: string;
  readonly featureNames: readonly string[];
  readonly intercept: number;
  readonly coefficients: readonly number[];
  readonly caveat: string;
  readonly attribution: string;
  readonly licence: string;
}

/** The model trained by research/xg/train.py. */
export const DEFAULT_XG_MODEL: XgModel = xgModelJson;

function assertShot(shot: ShotInput): void {
  const inRange = (value: number): boolean => Number.isFinite(value) && value >= 0 && value <= 100;
  if (!inRange(shot.x) || !inRange(shot.y)) {
    throw new EngineError('INVALID_EVENT', 'Shot position x and y must be numbers from 0 to 100.');
  }
}

/** Geometry and flags for one shot, in the same form the trainer used. */
export function shotFeatures(shot: ShotInput): ShotFeatures {
  assertShot(shot);
  const dx = (100 - shot.x) * (PITCH_LENGTH_M / 100);
  const dy = (50 - shot.y) * (PITCH_WIDTH_M / 100);
  const distance = Math.sqrt(dx * dx + dy * dy);
  const half = GOAL_WIDTH_M / 2;
  const rawAngle = Math.atan2(GOAL_WIDTH_M * dx, dx * dx + dy * dy - half * half);
  const angle = Math.min(Math.max(rawAngle, 0), Math.PI);
  return {
    distance,
    angle,
    isHeader: shot.header ? 1 : 0,
    isFreeKick: shot.freeKick ? 1 : 0,
    distanceAngle: distance * angle,
    distanceSquared: distance * distance,
  };
}

/**
 * Probability-like chance quality of a shot, in (0, 1). For youth football this
 * is a shot-quality index, not a calibrated probability: the model was trained on
 * men's professional matches (see `model.caveat`).
 */
export function expectedGoals(shot: ShotInput, model: XgModel = DEFAULT_XG_MODEL): number {
  if (model.featureNames.length !== model.coefficients.length) {
    throw new RangeError('Model has a different number of feature names and coefficients.');
  }
  const features = shotFeatures(shot);
  let z = model.intercept;
  model.featureNames.forEach((name, index) => {
    if (!Object.hasOwn(features, name)) {
      throw new RangeError(`Model uses an unknown feature: ${name}.`);
    }
    z += features[name as keyof ShotFeatures] * (model.coefficients[index] ?? 0);
  });
  return 1 / (1 + Math.exp(-z));
}

/** Shot weight as a whole number of 1/10,000 goals, the momentum engine's unit. */
export function xgUnits(shot: ShotInput, model: XgModel = DEFAULT_XG_MODEL): number {
  return Math.round(expectedGoals(shot, model) * XG_UNITS_PER_GOAL);
}
