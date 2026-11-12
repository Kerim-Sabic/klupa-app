import type { Side } from '../../engine';
import {
  inBox,
  otherTeam,
  shotUnits,
  type ProEvent,
  type ProMatch,
  type TeamIndex,
} from '../../engine/pro';
import { TERRITORY_UNITS, type EventKind } from '../matches/weights';
import type { ReviewEvent } from '../momentum/reviewModel';

/*
 * A pro match as the coach's taps. The momentum engine, the shot map and the lead-up table read
 * these exactly as they read a coach's own match: same kinds, same weights, same frame.
 *
 *   goal / shot on target / shot off target
 *       every shot (kind `shot`), by its goal and on-target flags. Weight: the chance-quality
 *       model on the shot's position, as the app weighs a located shot; a penalty is a fixed
 *       7,600 units, as in the momentum research. x, y are the provider's own frame, which is
 *       the app's frame (x towards the attacked goal).
 *   goal (own goal)
 *       counted for the other team with weight 0 and no position: it settles the score but is
 *       no chance. Left out when `ownGoals` is false (the shot map, which draws chances).
 *   corner
 *       a set piece with the corner flag.
 *   box_entry
 *       an accurate pass, or a set-piece cross (the provider marks no accuracy on those), that
 *       starts outside the penalty area and ends inside it. Corners are counted as corners.
 *   high_recovery / lost_ball_own_half
 *       one per change of possession. Possession is the team of the last pass, shot, set piece
 *       or other touch on the ball; it changes when the other team makes one of those, or wins
 *       a duel. A restart (set piece) is not a change. Where the new team won the ball decides
 *       the tag: in its attacking 40% (x >= 60) it is a high recovery for that team; between
 *       halfway and there (50 <= x < 60) it is the old team losing the ball in its own half.
 *       Both carry the same weight for the same team, so one turnover never counts twice.
 *       Turnovers in the winning team's own half carry no evidence, as for a coach.
 */

export const HIGH_REGAIN_X = 60;

const SIDE: Readonly<Record<TeamIndex, Side>> = { 0: 'home', 1: 'away' };

export interface ToReviewOptions {
  /** Include own goals as weightless goals for the other team (default true). */
  readonly ownGoals?: boolean;
}

function row(
  event: ProEvent,
  kind: EventKind,
  team: TeamIndex,
  weight: number,
  position: { readonly x: number; readonly y: number } | null,
): ReviewEvent {
  return {
    id: `${String(event.index)}:${kind}`,
    period: event.period,
    clock_seconds: event.t,
    side: SIDE[team],
    kind,
    weight,
    x: position?.x ?? null,
    y: position?.y ?? null,
  };
}

function shotKind(event: ProEvent): EventKind {
  if (event.goal) return 'goal';
  return event.accurate ? 'shot_on_target' : 'shot_off_target';
}

function isBoxEntry(event: ProEvent): boolean {
  if (event.at === null || event.end === null || inBox(event.at) || !inBox(event.end)) return false;
  if (event.kind === 'pass') return event.accurate;
  return event.kind === 'setPiece' && event.cross;
}

/** Possession-changing touch: on the ball (not a restart), or a won duel. */
function takesBall(event: ProEvent): boolean {
  if (event.kind === 'duel') return event.accurate;
  return event.kind === 'pass' || event.kind === 'shot' || event.kind === 'onBall';
}

function turnover(event: ProEvent): ReviewEvent | null {
  if (event.at === null) return null;
  if (event.at.x >= HIGH_REGAIN_X)
    return row(event, 'high_recovery', event.team, TERRITORY_UNITS.high_recovery, event.at);
  if (event.at.x < 50) return null;
  const loser = otherTeam(event.team);
  const where = { x: 100 - event.at.x, y: 100 - event.at.y };
  return row(event, 'lost_ball_own_half', loser, TERRITORY_UNITS.lost_ball_own_half, where);
}

/** The match's events as review rows, in match order. */
export function toReview(
  match: Pick<ProMatch, 'events'>,
  options: ToReviewOptions = {},
): ReviewEvent[] {
  const ownGoals = options.ownGoals ?? true;
  const rows: ReviewEvent[] = [];
  let holder: TeamIndex | null = null;
  let period = 0;
  for (const event of match.events) {
    if (event.period !== period) {
      period = event.period;
      holder = null;
    }
    if (event.kind === 'shot') {
      rows.push(row(event, shotKind(event), event.team, shotUnits(event), event.at));
    }
    if (event.ownGoal && ownGoals) rows.push(row(event, 'goal', otherTeam(event.team), 0, null));
    if (event.kind === 'setPiece' && event.corner) {
      rows.push(row(event, 'corner', event.team, TERRITORY_UNITS.corner, event.at));
    }
    if (isBoxEntry(event)) {
      rows.push(row(event, 'box_entry', event.team, TERRITORY_UNITS.box_entry, event.at));
    }
    if (takesBall(event) && holder === otherTeam(event.team)) {
      const change = turnover(event);
      if (change !== null) rows.push(change);
    }
    // A shot ends the possession (saved, wide or in): what follows is a restart, not a win.
    if (event.kind === 'shot') holder = null;
    else if (takesBall(event) || event.kind === 'setPiece') holder = event.team;
  }
  return rows;
}
