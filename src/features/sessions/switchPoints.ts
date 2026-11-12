import type { SwitchPoint } from '../../engine';

export type SwitchMessageKey =
  'sessions.fewer.change' | 'sessions.fewer.none' | 'sessions.fewer.appears';

export interface SwitchMessage {
  readonly key: SwitchMessageKey;
  /** The turnout from which the change applies ("N or fewer players"). */
  readonly count: number;
  /** The main drill that takes over, or null when none fits. The screen turns it into a name. */
  readonly drillKey: string | null;
}

/**
 * Turn the planner's switch points into plain-language messages. Three cases matter to a
 * coach: another main drill takes over, no main drill fits any more, or (when tonight's
 * numbers fit nothing) a smaller group makes one possible.
 */
export function describeSwitchPoints(points: readonly SwitchPoint[]): SwitchMessage[] {
  return points.map((point) => {
    if (point.to === null)
      return { key: 'sessions.fewer.none', count: point.players, drillKey: null };
    const key = point.from === null ? 'sessions.fewer.appears' : 'sessions.fewer.change';
    return { key, count: point.players, drillKey: point.to };
  });
}
