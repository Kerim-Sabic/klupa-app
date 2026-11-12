import { z } from 'zod';
import type { EventInsert } from './model';

/**
 * An offline queue so no tap is ever lost. Everything here is a pure function over an `Outbox`
 * value; the localStorage adapter at the bottom is the only side effect. Each event carries a
 * `client_id`, and the server stores it with an upsert that ignores duplicates on
 * `(match_id, client_id)`, so sending the same item twice can never double-count.
 */
export type OutboxOp =
  | { readonly kind: 'event'; readonly row: EventInsert }
  | {
      readonly kind: 'undo';
      readonly clubId: string;
      readonly matchId: string;
      readonly clientId: string;
      readonly deletedAt: string;
    }
  | {
      readonly kind: 'status';
      readonly clubId: string;
      readonly matchId: string;
      readonly status: 'live' | 'finished';
    };

export interface OutboxItem {
  /** The event's client_id for an event; a fresh UUID for other operations. */
  readonly id: string;
  readonly matchId: string;
  /** Device time of the tap, used to order the feed before the server has the row. */
  readonly recordedAt: string;
  readonly op: OutboxOp;
}

export interface FailedItem extends OutboxItem {
  /** Database error code (or "unknown"); the screen turns it into words. */
  readonly reason: string;
  readonly failedAt: string;
}

export interface Outbox {
  readonly pending: readonly OutboxItem[];
  /** Permanently refused by the server: shown to the coach, never retried on its own. */
  readonly failed: readonly FailedItem[];
}

export const EMPTY_OUTBOX: Outbox = { pending: [], failed: [] };

/** Adds an item at the end. The same id twice is ignored, so a double tap cannot queue twice. */
export function enqueue(queue: Outbox, item: OutboxItem): Outbox {
  if (queue.pending.some((entry) => entry.id === item.id)) return queue;
  return { ...queue, pending: [...queue.pending, item] };
}

export function markSent(queue: Outbox, id: string): Outbox {
  if (!queue.pending.some((entry) => entry.id === id)) return queue;
  return { ...queue, pending: queue.pending.filter((entry) => entry.id !== id) };
}

export function markFailed(queue: Outbox, id: string, reason: string, failedAt: string): Outbox {
  const item = queue.pending.find((entry) => entry.id === id);
  if (item === undefined) return queue;
  return {
    pending: queue.pending.filter((entry) => entry.id !== id),
    failed: [...queue.failed, { ...item, reason, failedAt }],
  };
}

/** Puts a refused item back at the end of the queue, for after the cause has been fixed. */
export function retryFailed(queue: Outbox, id: string): Outbox {
  const item = queue.failed.find((entry) => entry.id === id);
  if (item === undefined) return queue;
  const pending: OutboxItem = {
    id: item.id,
    matchId: item.matchId,
    recordedAt: item.recordedAt,
    op: item.op,
  };
  return {
    pending: [...queue.pending, pending],
    failed: queue.failed.filter((entry) => entry.id !== id),
  };
}

export function dismissFailed(queue: Outbox, id: string): Outbox {
  return { ...queue, failed: queue.failed.filter((entry) => entry.id !== id) };
}

export function pendingFor(queue: Outbox, matchId: string): readonly OutboxItem[] {
  return queue.pending.filter((entry) => entry.matchId === matchId);
}

export function failedFor(queue: Outbox, matchId: string): readonly FailedItem[] {
  return queue.failed.filter((entry) => entry.matchId === matchId);
}

function codeOf(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) return null;
  return typeof error.code === 'string' ? error.code : null;
}

/** Codes that say "try again later" rather than "this will never be accepted". */
const TRANSIENT_CODES: ReadonlySet<string> = new Set([
  '54000', // our own write limit: wait a minute
  '40001', // serialization failure
  '40P01', // deadlock
  '57014', // statement cancelled
  '57P01', // server restarting
  'PGRST000', // PostgREST could not reach the database
  'PGRST001',
  'PGRST002',
  'PGRST003',
  'PGRST301', // expired session: retried once the token refreshes
  'PGRST303',
]);

/**
 * Network trouble, an outage or an expired session is transient and keeps the item queued.
 * A failed fetch arrives from supabase-js with an empty code; a gateway error page has none.
 */
export function isTransient(error: unknown, online: boolean = navigator.onLine): boolean {
  if (!online || error instanceof TypeError) return true;
  const code = codeOf(error);
  if (code === null || code === '') return true;
  return TRANSIENT_CODES.has(code) || code.startsWith('08');
}

export function reasonOf(error: unknown): string {
  const code = codeOf(error);
  return code === null || code === '' ? 'unknown' : code;
}

export interface FlushResult {
  readonly queue: Outbox;
  readonly sent: readonly OutboxItem[];
  readonly failed: readonly { readonly id: string; readonly reason: string }[];
  /** True when sending stopped at a network failure; the rest stays queued in order. */
  readonly stopped: boolean;
}

/**
 * Sends pending items one at a time, in order. A permanent refusal moves the item to `failed`
 * and continues; a transient failure stops so later items never overtake earlier ones.
 */
export async function flush(
  queue: Outbox,
  send: (item: OutboxItem) => Promise<void>,
  options: { readonly now?: () => string; readonly online?: () => boolean } = {},
): Promise<FlushResult> {
  const now = options.now ?? (() => new Date().toISOString());
  const online = options.online ?? (() => navigator.onLine);
  let next = queue;
  const sent: OutboxItem[] = [];
  const failed: { id: string; reason: string }[] = [];
  for (const item of queue.pending) {
    try {
      await send(item);
      next = markSent(next, item.id);
      sent.push(item);
    } catch (error) {
      if (isTransient(error, online())) return { queue: next, sent, failed, stopped: true };
      const reason = reasonOf(error);
      next = markFailed(next, item.id, reason, now());
      failed.push({ id: item.id, reason });
    }
  }
  return { queue: next, sent, failed, stopped: false };
}

/**
 * Applies a flush outcome to the latest queue. Taps that arrived while the flush was awaiting
 * the network are in `latest` but not in the flush's own copy, so they must survive.
 */
export function applyFlush(latest: Outbox, result: FlushResult, failedAt: string): Outbox {
  let next = latest;
  for (const item of result.sent) next = markSent(next, item.id);
  for (const entry of result.failed) next = markFailed(next, entry.id, entry.reason, failedAt);
  return next;
}

export const OUTBOX_KEY = 'klupa.outbox';

const insertSchema = z.object({
  client_id: z.string().min(1),
  club_id: z.string().min(1),
  match_id: z.string().min(1),
  period: z.number().int(),
  clock_seconds: z.number().int(),
  side: z.enum(['home', 'away']),
  kind: z.enum([
    'goal',
    'shot_on_target',
    'shot_off_target',
    'big_chance',
    'box_entry',
    'corner',
    'high_recovery',
    'lost_ball_own_half',
  ]),
  weight: z.number().int(),
  x: z.number().int().nullable(),
  y: z.number().int().nullable(),
  header: z.boolean(),
});

const opSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('event'), row: insertSchema }),
  z.object({
    kind: z.literal('undo'),
    clubId: z.string(),
    matchId: z.string(),
    clientId: z.string(),
    deletedAt: z.string(),
  }),
  z.object({
    kind: z.literal('status'),
    clubId: z.string(),
    matchId: z.string(),
    status: z.enum(['live', 'finished']),
  }),
]);

const itemSchema = z.object({
  id: z.string().min(1),
  matchId: z.string().min(1),
  recordedAt: z.string(),
  op: opSchema,
});

const failedSchema = itemSchema.extend({ reason: z.string(), failedAt: z.string() });

/** Keeps every readable item; one damaged entry must not throw away the rest of the queue. */
function readList<T>(value: unknown, schema: z.ZodType<T>): T[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry: unknown) => {
    const parsed = schema.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
}

export function parseOutbox(raw: string | null): Outbox {
  if (raw === null) return EMPTY_OUTBOX;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return EMPTY_OUTBOX;
    const record = value as Record<string, unknown>;
    return {
      pending: readList(record.pending, itemSchema),
      failed: readList(record.failed, failedSchema),
    };
  } catch {
    return EMPTY_OUTBOX;
  }
}

export function loadOutbox(storage: Pick<Storage, 'getItem'> = window.localStorage): Outbox {
  try {
    return parseOutbox(storage.getItem(OUTBOX_KEY));
  } catch {
    return EMPTY_OUTBOX;
  }
}

export function saveOutbox(
  queue: Outbox,
  storage: Pick<Storage, 'setItem'> = window.localStorage,
): boolean {
  try {
    storage.setItem(OUTBOX_KEY, JSON.stringify(queue));
    return true;
  } catch {
    return false;
  }
}
