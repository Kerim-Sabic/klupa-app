/** A seeded generator, so a sample season is the same every time for the same seed. */
export type Rng = () => number;

/** mulberry32: small, fast, and good enough for invented data. Returns values in [0, 1). */
export function mulberry32(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** A whole number from `min` to `max`, both included. */
export function int(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

/** The item at `index`; a missing one is a bug in the generator, so it fails loudly. */
export function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new RangeError(`No item at index ${String(index)}.`);
  return item;
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  return at(items, int(rng, 0, items.length - 1));
}

/** A shuffled copy. Sorting by random keys keeps it free of index juggling. */
export function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  return items
    .map((item) => ({ item, key: rng() }))
    .sort((a, b) => a.key - b.key)
    .map((entry) => entry.item);
}

export type Weighted<T> = readonly [readonly [T, number], ...(readonly [T, number])[]];

/** Picks a value with probability proportional to its weight. */
export function weighted<T>(rng: Rng, entries: Weighted<T>): T {
  const total = entries.reduce((sum, entry) => sum + entry[1], 0);
  let remaining = rng() * total;
  let chosen = entries[0][0];
  for (const [value, weight] of entries) {
    if (remaining >= 0) chosen = value;
    remaining -= weight;
  }
  return chosen;
}

/** A version-4 shaped identifier from the generator, never from the clock or the platform. */
export function uuid(rng: Rng): string {
  const digits = Array.from({ length: 32 }, () => int(rng, 0, 15).toString(16));
  digits[12] = '4';
  digits[16] = '89ab'.charAt(int(rng, 0, 3));
  const text = digits.join('');
  return [
    text.slice(0, 8),
    text.slice(8, 12),
    text.slice(12, 16),
    text.slice(16, 20),
    text.slice(20),
  ].join('-');
}

const DAY_MS = 86_400_000;

function utcDay(iso: string): number {
  return Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
}

/** 'YYYY-MM-DD' shifted by whole days. Calendar arithmetic only; no time zones involved. */
export function shiftDate(iso: string, days: number): string {
  return new Date(utcDay(iso) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Days since Monday: 0 on a Monday, 6 on a Sunday. */
export function daysSinceMonday(iso: string): number {
  return (new Date(utcDay(iso)).getUTCDay() + 6) % 7;
}
