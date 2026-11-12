import { xgUnits, type EvidenceEvent, type Side } from '../../engine';
import type { Enums } from '../../lib/supabase';

export type EventKind = Enums['event_kind'];

/** Every kind the tagger offers, in the order of the button grid. */
export const EVENT_KINDS: readonly EventKind[] = [
  'goal',
  'shot_on_target',
  'shot_off_target',
  'big_chance',
  'box_entry',
  'corner',
  'high_recovery',
  'lost_ball_own_half',
];

export type ShotKind = Extract<EventKind, 'goal' | 'shot_on_target' | 'shot_off_target'>;
export type TerritoryKind = Exclude<EventKind, ShotKind>;

const SHOT_KINDS: ReadonlySet<EventKind> = new Set<EventKind>([
  'goal',
  'shot_on_target',
  'shot_off_target',
]);

/** Shots and goals ask where they were taken from; everything else saves on one tap. */
export function isShotKind(kind: EventKind): kind is ShotKind {
  return SHOT_KINDS.has(kind);
}

/**
 * A shot recorded without a location still counts as evidence. 700 units (0.07 xG) is close to
 * the average professional shot, so an untapped shot is neither ignored nor overstated.
 */
export const DEFAULT_SHOT_UNITS = 700;

/**
 * Territory events in the same 1/10,000-goal unit as xG. These values are a CONVENTION, not a
 * measurement: they were chosen so that a youth match with few shots still produces evidence,
 * and so that no single territory tag outweighs a real chance (a big chance is 0.35 of a goal;
 * a corner is worth a quarter of an average shot). They are not fitted to any data.
 */
export const TERRITORY_UNITS: Readonly<Record<TerritoryKind, number>> = {
  big_chance: 3500,
  box_entry: 300,
  corner: 250,
  high_recovery: 150,
  lost_ball_own_half: 150,
};

export interface WeightInput {
  readonly kind: EventKind;
  /** Database convention: x towards the attacked goal (goal line 100), y across, both 0-100. */
  readonly location?: { readonly x: number; readonly y: number } | null;
  readonly header?: boolean;
  readonly freeKick?: boolean;
}

/** How much momentum evidence one tagged event carries, in 1/10,000 of a goal. */
export function eventWeight(input: WeightInput): number {
  if (!isShotKind(input.kind)) return TERRITORY_UNITS[input.kind];
  if (input.location === undefined || input.location === null) return DEFAULT_SHOT_UNITS;
  return xgUnits({
    x: input.location.x,
    y: input.location.y,
    header: input.header === true,
    freeKick: input.freeKick === true,
  });
}

export function otherSide(side: Side): Side {
  return side === 'home' ? 'away' : 'home';
}

/**
 * The side the evidence favours. Losing the ball in your own half is tagged against the team
 * that lost it, but it is evidence that the other team is on top, so it flips.
 */
export function evidenceSide(kind: EventKind, side: Side): Side {
  return kind === 'lost_ball_own_half' ? otherSide(side) : side;
}

/** The stored columns the momentum engine needs. */
export interface EvidenceRow {
  readonly id: string;
  readonly period: number;
  readonly clock_seconds: number;
  readonly side: Side;
  readonly kind: EventKind;
  readonly weight: number;
}

/**
 * One stored event as engine evidence. The stored weight is used as recorded, because it
 * already includes inputs (such as a direct free kick) that are not kept as columns.
 */
export function toEvidence(row: EvidenceRow): EvidenceEvent {
  return {
    id: row.id,
    period: row.period,
    t: row.clock_seconds,
    side: evidenceSide(row.kind, row.side),
    weight: row.weight,
  };
}

/** Every event that was not undone, as evidence, in the order given. */
export function toEvidenceList(
  rows: readonly (EvidenceRow & { readonly deleted_at: string | null })[],
): EvidenceEvent[] {
  return rows.filter((row) => row.deleted_at === null).map(toEvidence);
}
