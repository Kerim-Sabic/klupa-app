/**
 * Training focus areas a coach can pick for a session. Kept to eight so the
 * picker fits one phone screen and every focus can be fully covered by the
 * library.
 */
export const FOCUS_KEYS = [
  'receiving_under_pressure',
  'finishing',
  'one_v_one_attacking',
  'one_v_one_defending',
  'build_up',
  'pressing',
  'transition',
  'passing_combinations',
] as const;

export type FocusKey = (typeof FOCUS_KEYS)[number];

/**
 * Pitch space, ordered small to large. The planner compares positions in this
 * list, so the order is part of the contract.
 */
export const PITCH_AREAS = ['quarter', 'half', 'full'] as const;

export type PitchArea = (typeof PITCH_AREAS)[number];

/** Age bands, youngest first. */
export const AGE_GROUPS = ['u7', 'u9', 'u11', 'u13', 'u15', 'u17', 'u19', 'senior'] as const;

export type AgeGroup = (typeof AGE_GROUPS)[number];

/** Equipment a volunteer coach may or may not have on the night. */
export const EQUIPMENT = ['balls', 'cones', 'bibs', 'small_goals', 'full_goals'] as const;

export type Equipment = (typeof EQUIPMENT)[number];

/** Where a drill sits in a session: warm-up, main practice, or the closing game. */
export const DRILL_PHASES = ['warmup', 'main', 'game'] as const;

export type DrillPhase = (typeof DRILL_PHASES)[number];

/** Every user-facing drill text ships in Bosnian and English together. */
export interface LocalizedText {
  readonly bs: string;
  readonly en: string;
}

export interface Drill {
  /** Stable kebab-case identifier; plans and saved sessions refer to drills by key. */
  readonly key: string;
  readonly name: LocalizedText;
  readonly summary: LocalizedText;
  readonly setup: LocalizedText;
  /** Two or three short cues the coach can shout during the drill. */
  readonly coachingPoints: readonly LocalizedText[];
  readonly easier: LocalizedText;
  readonly harder: LocalizedText;
  /** One or two focus areas this drill practises. */
  readonly focus: readonly FocusKey[];
  readonly phase: DrillPhase;
  readonly minPlayers: number;
  readonly maxPlayers: number;
  /** Default duration in whole minutes; the planner scales it to the budget. */
  readonly minutes: number;
  /** Smallest space the drill works in. */
  readonly minArea: PitchArea;
  /** Everything the drill needs; it is unusable if any item is missing. */
  readonly equipment: readonly Equipment[];
  readonly ageGroups: readonly AgeGroup[];
  /**
   * Planning estimate of attempts at the focus action per player per minute.
   * It is a coach's rule of thumb used to compare drills, not a measured value,
   * and must never be shown as one.
   */
  readonly repsPerPlayerMinute: number;
}

/** Shared age lists so the drill files stay short and consistent. */
export const ALL_AGES: readonly AgeGroup[] = AGE_GROUPS;
export const FROM_U9: readonly AgeGroup[] = AGE_GROUPS.slice(1);
export const FROM_U11: readonly AgeGroup[] = AGE_GROUPS.slice(2);
