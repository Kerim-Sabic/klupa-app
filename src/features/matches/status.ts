import type { MatchStatus } from './model';

/**
 * The match state machine, exactly as the database enforces it (`app.enforce_match_status`):
 * a match is scheduled, goes live, is finished, and a finished match may be reopened. Events
 * are only accepted once it has gone live.
 *
 * It is kept here as data so the screen only ever queues a move the database will accept;
 * the database stays the authority, and `tests/integration` checks that it refuses the rest.
 */
export const MATCH_TRANSITIONS: Readonly<Record<MatchStatus, readonly MatchStatus[]>> = {
  scheduled: ['live'],
  live: ['finished'],
  finished: ['live'],
};

/** True when a match in state `from` may move to `to`. Staying put is not a move. */
export function canTransition(from: MatchStatus, to: MatchStatus): boolean {
  return MATCH_TRANSITIONS[from].includes(to);
}

/**
 * The state a match will be in once the moves still waiting on the phone have been sent, in
 * the order they were queued. A queued move that is not legal from where the match then is
 * will be refused by the database, so it does not count.
 */
export function statusAfter(current: MatchStatus, queued: readonly MatchStatus[]): MatchStatus {
  return queued.reduce((state, next) => (canTransition(state, next) ? next : state), current);
}
