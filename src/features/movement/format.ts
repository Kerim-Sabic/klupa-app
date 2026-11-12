const DECIMAL: Readonly<Record<string, string>> = { bs: ',', en: '.' };
const GROUP: Readonly<Record<string, string>> = { bs: '.', en: ',' };

/**
 * A number with fixed decimals and the language's separators, from a table rather than Intl
 * so phones with trimmed locale data agree (the approach of `formatXg`).
 */
export function formatNumber(value: number, digits: number, language: string): string {
  const rounded = value.toFixed(digits);
  const clean = Number(rounded) === 0 ? (0).toFixed(digits) : rounded;
  const [whole = '0', fraction] = clean.replace('-', '').split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, GROUP[language] ?? ',');
  const sign = clean.startsWith('-') ? '−' : '';
  return `${sign}${grouped}${fraction === undefined ? '' : (DECIMAL[language] ?? '.') + fraction}`;
}

/** A share in [0, 1] as a whole percentage. */
export function formatPercent(share: number, language: string): string {
  return formatNumber(share * 100, 0, language);
}

/** Bytes as megabytes with one decimal. */
export function formatMegabytes(bytes: number, language: string): string {
  return formatNumber(bytes / 1_000_000, 1, language);
}
