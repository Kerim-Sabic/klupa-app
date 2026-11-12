/*
 * Paging by key, newest first. A page is "the rows strictly older than the last row I have",
 * by date and then id, so a row added while someone scrolls never shifts or repeats another.
 * The database is asked for one row more than a page; that extra row only says whether
 * another page exists and is not shown.
 */

/** Rows shown per page of a list a coach scrolls. */
export const PAGE_SIZE = 20;

export interface PageCursor {
  readonly date: string;
  readonly id: string;
}

export interface Page<T> {
  readonly rows: T[];
  /** The key of the last row shown, when older rows exist; null on the last page. */
  readonly next: PageCursor | null;
}

/** Splits what the database returned (up to one row more than a page) into page and key. */
export function splitPage<T extends { readonly id: string }>(
  rows: readonly T[],
  dateOf: (row: T) => string,
  size: number = PAGE_SIZE,
): Page<T> {
  const shown = rows.slice(0, size);
  const last = shown.at(-1);
  const more = rows.length > size && last !== undefined;
  return { rows: shown, next: more ? { date: dateOf(last), id: last.id } : null };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The REST filter for "strictly older than this row", by `column` (a date) and then id. The
 * key came from a row the database returned, but it is checked anyway: it is placed in a
 * filter string, and nothing unchecked goes there.
 */
export function olderThan(column: 'played_on' | 'held_on', cursor: PageCursor): string {
  if (!ISO_DATE.test(cursor.date) || !UUID.test(cursor.id)) {
    throw new Error('A page key must be a date and a row id.');
  }
  return `${column}.lt.${cursor.date},and(${column}.eq.${cursor.date},id.lt.${cursor.id})`;
}
