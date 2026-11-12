import { describe, expect, it } from 'vitest';
import { liveEvents, mergeFeed, recentEvents, rowFromInsert } from './feed';
import { EMPTY_OUTBOX, enqueue, markFailed, type OutboxItem } from './outbox';
import { eventItem, makeInsert, makeRow } from './testing';

const undoItem = (clientId: string, deletedAt = '2026-11-14T10:05:00.000Z'): OutboxItem => ({
  id: `undo-${clientId}`,
  matchId: 'match-1',
  recordedAt: deletedAt,
  op: { kind: 'undo', clubId: 'club-1', matchId: 'match-1', clientId, deletedAt },
});

describe('rowFromInsert', () => {
  it('builds the row the server will store, keyed by the client id', () => {
    const row = rowFromInsert(makeInsert({ client_id: 'x', x: 90, y: 40 }), '2026-11-14T10:00:00Z');
    expect(row).toMatchObject({ id: 'x', client_id: 'x', x: 90, y: 40, deleted_at: null });
    expect(row.created_at).toBe('2026-11-14T10:00:00Z');
  });
});

describe('mergeFeed', () => {
  it('shows server rows as saved and only for this match', () => {
    const feed = mergeFeed(
      [makeRow({ client_id: 'a' }), makeRow({ client_id: 'b', match_id: 'match-2' })],
      EMPTY_OUTBOX,
      'match-1',
    );
    expect(feed.map((event) => [event.client_id, event.sync])).toEqual([['a', 'saved']]);
  });

  it('adds queued and refused events, ordered by period and clock', () => {
    let queue = enqueue(
      EMPTY_OUTBOX,
      eventItem(makeInsert({ client_id: 'late', clock_seconds: 900 })),
    );
    queue = enqueue(queue, eventItem(makeInsert({ client_id: 'bad', clock_seconds: 30 })));
    queue = enqueue(queue, eventItem(makeInsert({ client_id: 'other', match_id: 'match-2' })));
    queue = markFailed(queue, 'bad', '23514', '2026-11-14T10:00:00Z');
    const server = [makeRow({ client_id: 'p2', period: 2, clock_seconds: 10 })];
    const feed = mergeFeed(server, queue, 'match-1');
    expect(feed.map((event) => [event.client_id, event.sync])).toEqual([
      ['bad', 'failed'],
      ['late', 'pending'],
      ['p2', 'saved'],
    ]);
  });

  it('prefers the server row when an event is both sent and still queued', () => {
    const queue = enqueue(EMPTY_OUTBOX, eventItem(makeInsert({ client_id: 'a' })));
    const feed = mergeFeed([makeRow({ client_id: 'a' })], queue, 'match-1');
    expect(feed).toHaveLength(1);
    expect(feed[0]?.sync).toBe('saved');
  });

  it('hides an event as soon as its undo is queued', () => {
    let queue = enqueue(EMPTY_OUTBOX, undoItem('a'));
    queue = enqueue(queue, eventItem(makeInsert({ client_id: 'b' })));
    queue = enqueue(queue, undoItem('b'));
    queue = enqueue(queue, undoItem('missing'));
    const feed = mergeFeed([makeRow({ client_id: 'a' })], queue, 'match-1');
    expect(feed.every((event) => event.deleted_at !== null)).toBe(true);
    expect(liveEvents(feed)).toEqual([]);
  });

  it('keeps the first undo time for an event that was already undone', () => {
    const server = [makeRow({ client_id: 'a', deleted_at: '2026-11-14T09:00:00Z' })];
    const feed = mergeFeed(server, enqueue(EMPTY_OUTBOX, undoItem('a')), 'match-1');
    expect(feed[0]?.deleted_at).toBe('2026-11-14T09:00:00Z');
  });

  it('breaks ties at the same second by recording time', () => {
    const server = [
      makeRow({ client_id: 'second', created_at: '2026-11-14T10:00:02Z' }),
      makeRow({ client_id: 'first', created_at: '2026-11-14T10:00:01Z' }),
    ];
    expect(mergeFeed(server, EMPTY_OUTBOX, 'match-1').map((e) => e.client_id)).toEqual([
      'first',
      'second',
    ]);
  });
});

describe('recentEvents', () => {
  it('returns the newest five that still count, newest first', () => {
    const rows = Array.from({ length: 7 }, (_, index) =>
      makeRow({ client_id: `e${String(index)}`, clock_seconds: index * 10 }),
    );
    rows.push(
      makeRow({ client_id: 'undone', clock_seconds: 999, deleted_at: '2026-11-14T10:00Z' }),
    );
    const feed = mergeFeed(rows, EMPTY_OUTBOX, 'match-1');
    expect(recentEvents(feed).map((event) => event.client_id)).toEqual([
      'e6',
      'e5',
      'e4',
      'e3',
      'e2',
    ]);
    expect(recentEvents(feed, 2)).toHaveLength(2);
  });
});
