import type { Measurement } from '../../engine/pose';

const DECIMAL: Readonly<Record<string, string>> = { bs: ',', en: '.' };

/**
 * A number with a fixed count of decimals and the language's own separator, from a
 * table rather than Intl (as `formatXg` does) so phones with trimmed locale data agree.
 * A minus sign is the real one, so a screen reader says "minus".
 */
export function formatNumber(value: number, digits: number, language: string): string {
  const rounded = value.toFixed(digits);
  const clean = Number(rounded) === 0 ? (0).toFixed(digits) : rounded;
  return clean.replace('-', '−').replace('.', DECIMAL[language] ?? '.');
}

const DIGITS: Readonly<Record<Measurement['unit'], number>> = { deg: 0, m: 2, 'm/s': 1, s: 2 };

/** The value as shown on a card: rounded to what the method can honestly resolve. */
export function formatMeasurement(
  m: Pick<Measurement, 'value' | 'unit'>,
  language: string,
): string {
  return formatNumber(m.value, DIGITS[m.unit], language);
}

/** Seconds as "1,23 s" style text without the unit. */
export function formatSeconds(seconds: number, language: string): string {
  return formatNumber(seconds, 2, language);
}

/** Megabytes, one decimal. */
export function formatMegabytes(bytes: number, language: string): string {
  return formatNumber(bytes / 1_000_000, 1, language);
}
