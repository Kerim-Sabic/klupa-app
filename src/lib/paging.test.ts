import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { PAGE_SIZE, olderThan, splitPage } from './paging';

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const row = (n: number, date: string) => ({ id: ID(n), played_on: date });
const dateOf = (r: { played_on: string }) => r.played_on;

describe('splitPage', () => {
  it('shows a page and names the key of its last row when one more row came back', () => {
    const rows = [row(3, '2026-11-10'), row(2, '2026-11-08'), row(1, '2026-11-01')];
    expect(splitPage(rows, dateOf, 2)).toEqual({
      rows: [rows[0], rows[1]],
      next: { date: '2026-11-08', id: ID(2) },
    });
  });

  it('is the last page when no extra row came back', () => {
    const rows = [row(2, '2026-11-08'), row(1, '2026-11-01')];
    expect(splitPage(rows, dateOf, 2)).toEqual({ rows, next: null });
    expect(splitPage([], dateOf)).toEqual({ rows: [], next: null });
    expect(PAGE_SIZE).toBe(20);
  });

  it('walks any list to its end without repeating or dropping a row (property)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 70 }),
        fc.integer({ min: 1, max: 9 }),
        (count, size) => {
          // Newest first, with dates that repeat so the id has to break ties.
          const all = Array.from({ length: count }, (_, index) =>
            row(count - index, `2026-10-${String(28 - Math.floor(index / 3)).padStart(2, '0')}`),
          );
          const seen: string[] = [];
          let offset = 0;
          for (;;) {
            const page = splitPage(all.slice(offset, offset + size + 1), dateOf, size);
            seen.push(...page.rows.map((r) => r.id));
            if (page.next === null) break;
            expect(page.next.id).toBe(page.rows.at(-1)?.id);
            offset += size;
          }
          expect(seen).toEqual(all.map((r) => r.id));
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('olderThan', () => {
  it('asks for rows strictly older by date, then by id on the same date', () => {
    expect(olderThan('played_on', { date: '2026-11-08', id: ID(2) })).toBe(
      `played_on.lt.2026-11-08,and(played_on.eq.2026-11-08,id.lt.${ID(2)})`,
    );
    expect(olderThan('held_on', { date: '2026-01-31', id: ID(9) })).toContain(
      'held_on.eq.2026-01-31',
    );
  });

  it('refuses a key that is not a date and a row id', () => {
    expect(() => olderThan('played_on', { date: '2026-11-08),id.gt.0', id: ID(1) })).toThrow(
      'A page key must be a date and a row id.',
    );
    expect(() => olderThan('played_on', { date: '2026-11-08', id: 'x,or(id.gt.0)' })).toThrow();
  });
});
