import type { Drill, Equipment, PitchArea } from '../../data/drills';
import type { RejectedDrill, SessionConstraints } from '../../engine';

export type RejectionMessage =
  | { readonly key: 'sessions.rejection.TOO_FEW_PLAYERS'; readonly count: number }
  | { readonly key: 'sessions.rejection.TOO_MANY_PLAYERS'; readonly count: number }
  | { readonly key: 'sessions.rejection.NOT_ENOUGH_SPACE'; readonly area: PitchArea }
  | { readonly key: 'sessions.rejection.AGE_GROUP' }
  | {
      readonly key: 'sessions.rejection.MISSING_EQUIPMENT';
      readonly missing: readonly Equipment[];
    };

/**
 * Say why one drill cannot run tonight, with the number that decides it. The drill is
 * looked up by the caller so this stays a pure function of data.
 */
export function describeRejection(
  rejected: RejectedDrill,
  drill: Drill,
  constraints: SessionConstraints,
): RejectionMessage {
  switch (rejected.reason) {
    case 'TOO_FEW_PLAYERS':
      return { key: 'sessions.rejection.TOO_FEW_PLAYERS', count: drill.minPlayers };
    case 'TOO_MANY_PLAYERS':
      return { key: 'sessions.rejection.TOO_MANY_PLAYERS', count: drill.maxPlayers };
    case 'NOT_ENOUGH_SPACE':
      return { key: 'sessions.rejection.NOT_ENOUGH_SPACE', area: drill.minArea };
    case 'AGE_GROUP':
      return { key: 'sessions.rejection.AGE_GROUP' };
    case 'MISSING_EQUIPMENT':
      return {
        key: 'sessions.rejection.MISSING_EQUIPMENT',
        missing: drill.equipment.filter((item) => !constraints.equipment.includes(item)),
      };
  }
}
