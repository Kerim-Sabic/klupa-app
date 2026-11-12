import type { FocusKey } from '../../data/drills';
import type { Side } from '../../engine';
import type { Enums } from '../../lib/supabase';
import { isShotKind } from '../matches/weights';

/**
 * Turns tag counts into at most two training prompts. These are prompts from counts, not a
 * diagnosis: every rule is a plain threshold a coach can check by hand, and each suggestion
 * carries the numbers behind it. Thresholds are a convention for youth matches, not fitted.
 */
export interface SuggestEvent {
  readonly side: Side;
  readonly kind: Enums['event_kind'];
  /** Chance quality in 1/10,000 units (only shots are summed). */
  readonly weight: number;
}

/** Below this many tagged events the counts say too little to suggest anything. */
export const MIN_EVENTS = 12;
export const MAX_SUGGESTIONS = 2;

export const THRESHOLDS = {
  /** Our own-half losses that suggest build-up play. */
  lostOwnHalf: 6,
  /** Box entries needed before the shot rate is worth reading. */
  boxEntries: 8,
  /** At most this many shots per box entry counts as "few shots". */
  shotsPerEntry: 0.25,
  /** Opponent high recoveries that suggest receiving under pressure. */
  opponentHighRecoveries: 6,
  /** Our high recoveries at or below this suggest pressing... */
  fewHighRecoveries: 1,
  /** ...but only when the coach tagged at least this many recoveries in the match. */
  recoveriesTagged: 4,
  /** Opponent chance quality at least this multiple of ours... */
  qualityRatio: 2,
  /** ...and at least this much higher in absolute terms (0.5 xG). */
  qualityGapUnits: 5000,
} as const;

export type ReasonCode =
  | 'lostOwnHalf'
  | 'entriesWithoutShots'
  | 'opponentHighRecoveries'
  | 'fewHighRecoveries'
  | 'chanceQualityGap';

export interface Reason {
  readonly code: ReasonCode;
  /** The counts behind the reason, ready for the sentence that shows them. */
  readonly values: Readonly<Record<string, number>>;
}

/** The focuses a rule can suggest; the others need more than counts to justify. */
export type SuggestedFocus = Extract<
  FocusKey,
  'build_up' | 'finishing' | 'receiving_under_pressure' | 'pressing' | 'one_v_one_defending'
>;

export interface FocusSuggestion {
  readonly focus: SuggestedFocus;
  readonly reasons: readonly Reason[];
  /** How far past its threshold the rule fired; only used to order suggestions. */
  readonly strength: number;
}

export type SuggestResult =
  | { readonly status: 'insufficient'; readonly events: number; readonly minimum: number }
  | { readonly status: 'ok'; readonly suggestions: readonly FocusSuggestion[] };

type Counts = Record<Side, Record<Enums['event_kind'], number>> & {
  readonly quality: Record<Side, number>;
};

function emptyKinds(): Record<Enums['event_kind'], number> {
  return {
    goal: 0,
    shot_on_target: 0,
    shot_off_target: 0,
    big_chance: 0,
    box_entry: 0,
    corner: 0,
    high_recovery: 0,
    lost_ball_own_half: 0,
  };
}

function countEvents(events: readonly SuggestEvent[]): Counts {
  const counts: Counts = { home: emptyKinds(), away: emptyKinds(), quality: { home: 0, away: 0 } };
  for (const event of events) {
    counts[event.side][event.kind] += 1;
    if (isShotKind(event.kind)) counts.quality[event.side] += event.weight;
  }
  return counts;
}

function shotsOf(kinds: Record<Enums['event_kind'], number>): number {
  return kinds.goal + kinds.shot_on_target + kinds.shot_off_target;
}

type Rule = (counts: Counts) => FocusSuggestion | null;

const RULES: readonly Rule[] = [
  ({ home }) => {
    const count = home.lost_ball_own_half;
    if (count < THRESHOLDS.lostOwnHalf) return null;
    return {
      focus: 'build_up',
      reasons: [{ code: 'lostOwnHalf', values: { lost: count } }],
      strength: count / THRESHOLDS.lostOwnHalf,
    };
  },
  ({ home }) => {
    const entries = home.box_entry;
    const shots = shotsOf(home);
    if (entries < THRESHOLDS.boxEntries || shots > entries * THRESHOLDS.shotsPerEntry) return null;
    return {
      focus: 'finishing',
      reasons: [{ code: 'entriesWithoutShots', values: { entries, shots } }],
      strength: entries / THRESHOLDS.boxEntries,
    };
  },
  ({ away }) => {
    const count = away.high_recovery;
    if (count < THRESHOLDS.opponentHighRecoveries) return null;
    return {
      focus: 'receiving_under_pressure',
      reasons: [{ code: 'opponentHighRecoveries', values: { recoveries: count } }],
      strength: count / THRESHOLDS.opponentHighRecoveries,
    };
  },
  ({ home, away }) => {
    const ours = home.high_recovery;
    const tagged = ours + away.high_recovery;
    if (ours > THRESHOLDS.fewHighRecoveries || tagged < THRESHOLDS.recoveriesTagged) return null;
    return {
      focus: 'pressing',
      reasons: [{ code: 'fewHighRecoveries', values: { ours, theirs: away.high_recovery } }],
      strength: tagged / THRESHOLDS.recoveriesTagged,
    };
  },
  ({ quality }) => {
    const gap = quality.away - quality.home;
    if (gap < THRESHOLDS.qualityGapUnits || quality.away < quality.home * THRESHOLDS.qualityRatio) {
      return null;
    }
    return {
      focus: 'one_v_one_defending',
      reasons: [{ code: 'chanceQualityGap', values: { ours: quality.home, theirs: quality.away } }],
      strength: gap / THRESHOLDS.qualityGapUnits,
    };
  },
];

/**
 * Up to two suggested focuses from one match's tags, strongest first; ties keep rule order.
 * `home` is always us. Undone events must be removed before calling.
 */
export function suggestFocus(events: readonly SuggestEvent[]): SuggestResult {
  if (events.length < MIN_EVENTS) {
    return { status: 'insufficient', events: events.length, minimum: MIN_EVENTS };
  }
  const counts = countEvents(events);
  const fired = RULES.map((rule) => rule(counts)).filter(
    (suggestion): suggestion is FocusSuggestion => suggestion !== null,
  );
  // Array.prototype.sort is stable, so equal strengths keep the rule order above.
  const suggestions = fired.sort((a, b) => b.strength - a.strength).slice(0, MAX_SUGGESTIONS);
  return { status: 'ok', suggestions };
}
