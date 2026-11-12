import type { EventInsert, EventRow } from './model';
import type { Outbox } from './outbox';

export type SyncState = 'saved' | 'pending' | 'failed';

export interface FeedEvent extends EventRow {
  readonly sync: SyncState;
}

/** A queued insert as the row the server will hold, so the feed can show it straight away. */
export function rowFromInsert(row: EventInsert, recordedAt: string): EventRow {
  return {
    id: row.client_id,
    client_id: row.client_id,
    match_id: row.match_id,
    period: row.period,
    clock_seconds: row.clock_seconds,
    side: row.side,
    kind: row.kind,
    weight: row.weight,
    x: row.x,
    y: row.y,
    header: row.header,
    created_at: recordedAt,
    deleted_at: null,
  };
}

function byMatchTime(a: FeedEvent, b: FeedEvent): number {
  return (
    a.period - b.period ||
    a.clock_seconds - b.clock_seconds ||
    a.created_at.localeCompare(b.created_at)
  );
}

/**
 * What the coach sees: the server's rows plus everything still on this phone. Server rows win
 * for the same client_id; a queued undo hides its event before the server has heard of it.
 */
export function mergeFeed(
  server: readonly EventRow[],
  outbox: Outbox,
  matchId: string,
): FeedEvent[] {
  const byClient = new Map<string, FeedEvent>();
  for (const row of server) {
    if (row.match_id === matchId) byClient.set(row.client_id, { ...row, sync: 'saved' });
  }
  const local = [
    ...outbox.pending.map((item) => ({ item, sync: 'pending' as const })),
    ...outbox.failed.map((item) => ({ item, sync: 'failed' as const })),
  ];
  for (const { item, sync } of local) {
    if (item.matchId !== matchId || item.op.kind !== 'event') continue;
    if (byClient.has(item.op.row.client_id)) continue;
    byClient.set(item.op.row.client_id, { ...rowFromInsert(item.op.row, item.recordedAt), sync });
  }
  for (const item of outbox.pending) {
    if (item.matchId !== matchId || item.op.kind !== 'undo') continue;
    const target = byClient.get(item.op.clientId);
    if (target !== undefined && target.deleted_at === null) {
      byClient.set(item.op.clientId, { ...target, deleted_at: item.op.deletedAt });
    }
  }
  return [...byClient.values()].sort(byMatchTime);
}

/** Events that still count (not undone), oldest first. */
export function liveEvents(feed: readonly FeedEvent[]): FeedEvent[] {
  return feed.filter((event) => event.deleted_at === null);
}

/** The newest `count` events that still count, newest first. */
export function recentEvents(feed: readonly FeedEvent[], count = 5): FeedEvent[] {
  return liveEvents(feed).slice(-count).reverse();
}
