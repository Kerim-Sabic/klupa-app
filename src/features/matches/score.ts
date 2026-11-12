import type { Side } from '../../engine';
import type { EventKind } from './weights';

export interface Score {
  /** Us. */
  readonly home: number;
  /** Them. */
  readonly away: number;
}

export interface ScoringEvent {
  readonly kind: EventKind;
  readonly side: Side;
  readonly deleted_at: string | null;
}

/** Goals per side. Undone (soft-deleted) goals do not count. */
export function scoreOf(events: readonly ScoringEvent[]): Score {
  let home = 0;
  let away = 0;
  for (const event of events) {
    if (event.kind !== 'goal' || event.deleted_at !== null) continue;
    if (event.side === 'home') home += 1;
    else away += 1;
  }
  return { home, away };
}
