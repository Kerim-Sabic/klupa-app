import { describe, expect, it, vi } from 'vitest';
import {
  applyFlush,
  dismissFailed,
  EMPTY_OUTBOX,
  enqueue,
  failedFor,
  flush,
  isTransient,
  loadOutbox,
  markFailed,
  markSent,
  OUTBOX_KEY,
  parseOutbox,
  pendingFor,
  reasonOf,
  retryFailed,
  saveOutbox,
  type Outbox,
  type OutboxItem,
} from './outbox';
import { dbError, eventItem, makeInsert } from './testing';

const a = eventItem(makeInsert({ client_id: 'a' }));
const b = eventItem(makeInsert({ client_id: 'b' }));
const c = eventItem(makeInsert({ client_id: 'c', match_id: 'match-2' }));
const queued = (...items: OutboxItem[]): Outbox => items.reduce(enqueue, EMPTY_OUTBOX);
const NOW = '2026-11-14T10:30:00.000Z';
const always = { now: () => NOW, online: () => true };

describe('queue operations', () => {
  it('enqueues in order and ignores the same id twice', () => {
    const queue = enqueue(queued(a, b), a);
    expect(queue.pending.map((item) => item.id)).toEqual(['a', 'b']);
  });

  it('marks an item sent by removing it, and ignores unknown ids', () => {
    const queue = queued(a, b);
    expect(markSent(queue, 'a').pending.map((item) => item.id)).toEqual(['b']);
    expect(markSent(queue, 'zzz')).toBe(queue);
  });

  it('moves a refused item to the visible failed list', () => {
    const queue = markFailed(queued(a, b), 'a', '23514', NOW);
    expect(queue.pending.map((item) => item.id)).toEqual(['b']);
    expect(queue.failed).toEqual([{ ...a, reason: '23514', failedAt: NOW }]);
    expect(markFailed(queue, 'zzz', 'x', NOW)).toBe(queue);
  });

  it('retries a failed item at the end of the queue, or removes it for good', () => {
    const failed = markFailed(queued(a, b), 'a', '42501', NOW);
    const retried = retryFailed(failed, 'a');
    expect(retried.pending.map((item) => item.id)).toEqual(['b', 'a']);
    expect(retried.pending[1]).toEqual(a);
    expect(retried.failed).toEqual([]);
    expect(retryFailed(failed, 'zzz')).toBe(failed);
    expect(dismissFailed(failed, 'a').failed).toEqual([]);
  });

  it('filters by match', () => {
    const queue = markFailed(queued(a, b, c), 'b', '23514', NOW);
    expect(pendingFor(queue, 'match-1').map((item) => item.id)).toEqual(['a']);
    expect(pendingFor(queue, 'match-2').map((item) => item.id)).toEqual(['c']);
    expect(failedFor(queue, 'match-1').map((item) => item.id)).toEqual(['b']);
  });
});

describe('isTransient', () => {
  it('treats network trouble as transient', () => {
    expect(isTransient(new TypeError('Failed to fetch'), true)).toBe(true);
    expect(isTransient({ code: '', message: 'TypeError: Failed to fetch' }, true)).toBe(true);
    expect(isTransient({ message: '<html>502</html>' }, true)).toBe(true);
    expect(isTransient('weird', true)).toBe(true);
    expect(isTransient({ code: '23514' }, false)).toBe(true);
  });

  it('treats outages, the write limit and expired sessions as transient', () => {
    for (const code of ['54000', 'PGRST000', 'PGRST301', '08006', '40001', '57014']) {
      expect(isTransient({ code }, true)).toBe(true);
    }
  });

  it('treats a refusal from the database as permanent', () => {
    for (const code of ['23514', '42501', '23503', '22P02', 'PGRST204']) {
      expect(isTransient({ code }, true)).toBe(false);
    }
  });

  it('reads the reason code', () => {
    expect(reasonOf({ code: '23514' })).toBe('23514');
    expect(reasonOf({ code: '' })).toBe('unknown');
    expect(reasonOf(null)).toBe('unknown');
    expect(reasonOf({ code: 5 })).toBe('unknown');
  });
});

describe('flush', () => {
  it('sends everything in order', async () => {
    const send = vi.fn<(item: OutboxItem) => Promise<void>>(() => Promise.resolve());
    const result = await flush(queued(a, b), send, always);
    expect(send.mock.calls.map(([item]) => item.id)).toEqual(['a', 'b']);
    expect(result.queue).toEqual(EMPTY_OUTBOX);
    expect(result.sent.map((item) => item.id)).toEqual(['a', 'b']);
    expect(result.stopped).toBe(false);
  });

  it('stops at the first network failure and keeps the rest in order', async () => {
    const send = vi.fn((item: OutboxItem) =>
      item.id === 'b' ? Promise.reject(new TypeError('offline')) : Promise.resolve(),
    );
    const result = await flush(queued(a, b, c), send, always);
    expect(send).toHaveBeenCalledTimes(2);
    expect(result.stopped).toBe(true);
    expect(result.queue.pending.map((item) => item.id)).toEqual(['b', 'c']);
  });

  it('parks a permanent refusal in failed and carries on', async () => {
    const send = vi.fn((item: OutboxItem) =>
      item.id === 'a' ? Promise.reject(dbError('23514')) : Promise.resolve(),
    );
    const result = await flush(queued(a, b), send, always);
    expect(result.queue.pending).toEqual([]);
    expect(result.queue.failed.map((item) => [item.id, item.reason, item.failedAt])).toEqual([
      ['a', '23514', NOW],
    ]);
    expect(result.failed).toEqual([{ id: 'a', reason: '23514' }]);
    expect(result.sent.map((item) => item.id)).toEqual(['b']);
  });

  it('keeps everything when the browser says it is offline', async () => {
    const send = vi.fn(() => Promise.reject(dbError('23514')));
    const result = await flush(queued(a), send, { now: () => NOW, online: () => false });
    expect(result.stopped).toBe(true);
    expect(result.queue.pending).toHaveLength(1);
  });

  it('does nothing with an empty queue', async () => {
    const send = vi.fn(() => Promise.resolve());
    const result = await flush(EMPTY_OUTBOX, send);
    expect(send).not.toHaveBeenCalled();
    expect(result.queue).toBe(EMPTY_OUTBOX);
  });

  it('applies the outcome to a queue that grew while the flush was waiting', async () => {
    const send = vi.fn((item: OutboxItem) =>
      item.id === 'b' ? Promise.reject(dbError('42501')) : Promise.resolve(),
    );
    const result = await flush(queued(a, b), send, always);
    const latest = enqueue(queued(a, b), c);
    const next = applyFlush(latest, result, NOW);
    expect(next.pending.map((item) => item.id)).toEqual(['c']);
    expect(next.failed.map((item) => item.id)).toEqual(['b']);
  });
});

describe('storage adapter', () => {
  it('round-trips the queue through localStorage', () => {
    const queue = markFailed(queued(a, b), 'b', '23514', NOW);
    expect(saveOutbox(queue)).toBe(true);
    expect(window.localStorage.getItem(OUTBOX_KEY)).not.toBeNull();
    expect(loadOutbox()).toEqual(queue);
  });

  it('keeps every readable entry when one is damaged', () => {
    const raw = JSON.stringify({ pending: [a, { id: 'broken' }, b], failed: 'nope' });
    expect(parseOutbox(raw)).toEqual({ pending: [a, b], failed: [] });
  });

  it('reads all three kinds of operation', () => {
    const undo: OutboxItem = {
      id: 'u',
      matchId: 'match-1',
      recordedAt: NOW,
      op: { kind: 'undo', clubId: 'club-1', matchId: 'match-1', clientId: 'a', deletedAt: NOW },
    };
    const status: OutboxItem = {
      id: 's',
      matchId: 'match-1',
      recordedAt: NOW,
      op: { kind: 'status', clubId: 'club-1', matchId: 'match-1', status: 'live' },
    };
    expect(parseOutbox(JSON.stringify(queued(status, a, undo))).pending).toHaveLength(3);
  });

  it('starts empty on missing, unreadable or blocked storage', () => {
    expect(parseOutbox(null)).toBe(EMPTY_OUTBOX);
    expect(parseOutbox('{oops')).toBe(EMPTY_OUTBOX);
    expect(parseOutbox('42')).toBe(EMPTY_OUTBOX);
    expect(parseOutbox('null')).toBe(EMPTY_OUTBOX);
    const blocked = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('quota');
      },
    };
    expect(loadOutbox(blocked)).toBe(EMPTY_OUTBOX);
    expect(saveOutbox(EMPTY_OUTBOX, blocked)).toBe(false);
  });
});
