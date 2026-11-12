import { GAME_DRILLS } from './games';
import { MAIN_DRILLS_A } from './mains-a';
import { MAIN_DRILLS_B } from './mains-b';
import type { Drill } from './types';
import { WARMUP_DRILLS } from './warmups';

export {
  AGE_GROUPS,
  DRILL_PHASES,
  EQUIPMENT,
  FOCUS_KEYS,
  PITCH_AREAS,
  type AgeGroup,
  type Drill,
  type DrillPhase,
  type Equipment,
  type FocusKey,
  type LocalizedText,
  type PitchArea,
} from './types';

/**
 * The bundled drill library: 6 warm-ups, 12 main practices and 6 games, all
 * original wording. Data only; the planner decides what fits a given night.
 */
export const DRILLS: readonly Drill[] = [
  ...WARMUP_DRILLS,
  ...MAIN_DRILLS_A,
  ...MAIN_DRILLS_B,
  ...GAME_DRILLS,
];
