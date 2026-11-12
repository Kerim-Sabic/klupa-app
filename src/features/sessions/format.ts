import { DRILLS, type Drill, type LocalizedText } from '../../data/drills';
import type { Rotation } from '../../engine';
import { formatDate } from '../../lib/dates';

const DRILL_BY_KEY: ReadonlyMap<string, Drill> = new Map(DRILLS.map((drill) => [drill.key, drill]));

export function findDrill(key: string): Drill | undefined {
  return DRILL_BY_KEY.get(key);
}

/** Drill text ships in both languages; anything that is not Bosnian reads English. */
export function localized(text: LocalizedText, language: string): string {
  return language === 'bs' ? text.bs : text.en;
}

/** A stored `YYYY-MM-DD` as "Thu, 12 Nov 2026" or "čet, 12. nov 2026."; the day never shifts. */
export function formatDay(isoDate: string, language: string): string {
  return formatDate(isoDate, language, 'weekday');
}

/** One decimal with the language's own separator, taken from a table (see `formatXg`). */
export function formatOneDecimal(value: number, language: string): string {
  return value.toFixed(1).replace('.', language === 'bs' ? ',' : '.');
}

/**
 * A planning estimate as a whole number. The planner keeps one decimal, but "about 31" is
 * what a coach can use, and a decimal would claim a precision a rule of thumb does not have.
 */
export function formatEstimate(value: number): string {
  return String(Math.round(value));
}

/** The least and most turns anyone gets; the rotation keeps them within one of each other. */
export function turnRange(rotation: Rotation): { low: number; high: number } {
  const counts = rotation.turns.map((entry) => entry.turns);
  return { low: Math.min(...counts), high: Math.max(...counts) };
}

/** Start and end minute of each block in a plan, back to back. */
export function blockRanges(minutes: readonly number[]): { from: number; to: number }[] {
  let cursor = 0;
  return minutes.map((length) => {
    const range = { from: cursor, to: cursor + length };
    cursor += length;
    return range;
  });
}
