import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { queryKeys, type MatchSummary } from '../../lib/data';
import { setMatchStatus, undoEvent, upsertEvent } from './api';
import { rowFromInsert } from './feed';
import type { EventRow } from './model';
import {
  applyFlush,
  dismissFailed,
  enqueue,
  flush,
  loadOutbox,
  retryFailed,
  saveOutbox,
  type FlushResult,
  type Outbox,
  type OutboxItem,
} from './outbox';

/** How often a non-empty queue is retried while the screen is open. */
export const FLUSH_INTERVAL_MS = 15_000;

export const matchScoresKey = ['match-scores'] as const;

/** Read through a function: the flag is set by other calls while this one awaits the network. */
function repeatRequested(flag: { readonly current: boolean }): boolean {
  return flag.current;
}

function subscribeOnline(onChange: () => void): () => void {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

/** `navigator.onLine`, kept current by the browser's online and offline events. */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine);
}

/** One queued operation to its database call. */
export function sendItem(item: OutboxItem): Promise<void> {
  const { op } = item;
  switch (op.kind) {
    case 'event':
      return upsertEvent(op.row);
    case 'undo':
      return undoEvent(op.clubId, op.matchId, op.clientId, op.deletedAt);
    case 'status':
      return setMatchStatus(op.clubId, op.matchId, op.status);
  }
}

/**
 * Writes what the server now holds into the cache before refetching, so a sent event never
 * blinks out of the feed between leaving the queue and the refetch arriving.
 */
function reflectSent(client: QueryClient, sent: readonly OutboxItem[]): void {
  for (const { op, recordedAt } of sent) {
    if (op.kind === 'event') {
      client.setQueryData<EventRow[]>(queryKeys.matchEvents(op.row.match_id), (old) =>
        old === undefined || old.some((row) => row.client_id === op.row.client_id)
          ? old
          : [...old, rowFromInsert(op.row, recordedAt)],
      );
    } else if (op.kind === 'undo') {
      client.setQueryData<EventRow[]>(queryKeys.matchEvents(op.matchId), (old) =>
        old?.map((row) =>
          row.client_id === op.clientId ? { ...row, deleted_at: op.deletedAt } : row,
        ),
      );
    } else {
      client.setQueryData<MatchSummary | null>(queryKeys.match(op.matchId), (old) =>
        old === undefined || old === null ? old : { ...old, status: op.status },
      );
    }
  }
}

async function refresh(client: QueryClient, result: FlushResult): Promise<void> {
  const matchIds = new Set(result.sent.map((item) => item.matchId));
  await Promise.all([
    ...[...matchIds].map((id) => client.invalidateQueries({ queryKey: queryKeys.matchEvents(id) })),
    client.invalidateQueries({ queryKey: ['matches'] }),
    client.invalidateQueries({ queryKey: matchScoresKey }),
  ]);
}

export interface OutboxApi {
  readonly queue: Outbox;
  readonly online: boolean;
  readonly add: (item: OutboxItem) => void;
  readonly retry: (id: string) => void;
  readonly dismiss: (id: string) => void;
  readonly flushNow: () => Promise<void>;
  /** The queue as it is right now, including changes not yet rendered. */
  readonly peek: () => Outbox;
}

/**
 * The outbox, persisted on every change and flushed on demand, when the browser comes back
 * online, and every 15 s while anything is waiting. Only one flush runs at a time; a request
 * during a flush runs another pass afterwards so a fresh tap never waits 15 s.
 */
export function useOutbox(send: (item: OutboxItem) => Promise<void> = sendItem): OutboxApi {
  const client = useQueryClient();
  const online = useOnline();
  const [queue, setQueue] = useState<Outbox>(() => loadOutbox());
  const latest = useRef(queue);
  const running = useRef<Promise<void> | null>(null);
  const again = useRef(false);

  const update = useCallback((change: (current: Outbox) => Outbox) => {
    const next = change(latest.current);
    if (next === latest.current) return;
    latest.current = next;
    saveOutbox(next);
    setQueue(next);
  }, []);

  const flushNow = useCallback((): Promise<void> => {
    if (running.current !== null) {
      // The pass in progress loops once more, and the caller waits for that pass too.
      again.current = true;
      return running.current;
    }
    if (latest.current.pending.length === 0) return Promise.resolve();
    // With something queued the pass always awaits the network before it can finish, so
    // `running` is set below before the `finally` clears it. The last check of `again` and the
    // clearing happen in one synchronous step, so no request can slip between them.
    const pass = (async () => {
      try {
        do {
          again.current = false;
          if (latest.current.pending.length === 0) return;
          const result = await flush(latest.current, send);
          reflectSent(client, result.sent);
          update((current) => applyFlush(current, result, new Date().toISOString()));
          if (result.sent.length > 0) await refresh(client, result);
          if (result.stopped) return;
        } while (repeatRequested(again));
      } finally {
        running.current = null;
      }
    })();
    running.current = pass;
    return pass;
  }, [client, send, update]);

  const peek = useCallback(() => latest.current, []);

  const hasPending = queue.pending.length > 0;

  useEffect(() => {
    void flushNow();
    const onOnline = () => {
      void flushNow();
    };
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('online', onOnline);
    };
  }, [flushNow]);

  useEffect(() => {
    if (!hasPending) return undefined;
    const timer = window.setInterval(() => {
      void flushNow();
    }, FLUSH_INTERVAL_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, [flushNow, hasPending]);

  const add = useCallback(
    (item: OutboxItem) => {
      update((current) => enqueue(current, item));
    },
    [update],
  );
  const retry = useCallback(
    (id: string) => {
      update((current) => retryFailed(current, id));
      void flushNow();
    },
    [flushNow, update],
  );
  const dismiss = useCallback(
    (id: string) => {
      update((current) => dismissFailed(current, id));
    },
    [update],
  );

  return { queue, online, add, retry, dismiss, flushNow, peek };
}
