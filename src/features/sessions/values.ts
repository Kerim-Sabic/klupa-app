import type { SessionPlan } from '../../engine';
import { validateForm, type FormErrors, type PlannerForm } from './constraints';

/** What gets stored for a new session; `api.ts` adds the club, team and session ids. */
export interface SessionValues {
  readonly session: {
    readonly held_on: string;
    readonly focus: string;
    readonly duration_minutes: number;
    readonly area: PlannerForm['area'];
    readonly expected_players: number;
    readonly floodlit: boolean;
    readonly source_match_id: string | null;
  };
  readonly drills: readonly {
    readonly position: number;
    readonly drill_key: string;
    readonly minutes: number;
  }[];
  readonly playerIds: readonly string[];
}

export type ValuesResult =
  | { readonly ok: true; readonly values: SessionValues }
  | { readonly ok: false; readonly reason: 'INVALID_FORM'; readonly errors: FormErrors }
  | { readonly ok: false; readonly reason: 'NOT_FEASIBLE' }
  | { readonly ok: false; readonly reason: 'INVALID_SQUAD' };

/**
 * Check everything the database would check, so a bad plan is explained on screen instead of
 * bouncing off a constraint. The plan is the one for the expected number of players.
 */
export function buildValues(options: {
  readonly form: PlannerForm;
  readonly plan: SessionPlan;
  readonly playerIds: readonly string[];
  readonly sourceMatchId: string | null;
}): ValuesResult {
  const { form, plan, playerIds, sourceMatchId } = options;
  const errors = validateForm(form);
  if (Object.keys(errors).length > 0) return { ok: false, reason: 'INVALID_FORM', errors };
  if (!plan.feasible || plan.blocks.length === 0) return { ok: false, reason: 'NOT_FEASIBLE' };
  if (new Set(playerIds).size !== playerIds.length || playerIds.includes('')) {
    return { ok: false, reason: 'INVALID_SQUAD' };
  }
  return {
    ok: true,
    values: {
      session: {
        held_on: form.heldOn,
        focus: form.focus,
        duration_minutes: form.minutes,
        area: form.area,
        expected_players: form.players,
        floodlit: form.floodlit,
        source_match_id: sourceMatchId,
      },
      drills: plan.blocks.map((block, index) => ({
        position: index + 1,
        drill_key: block.drillKey,
        minutes: block.minutes,
      })),
      playerIds,
    },
  };
}
