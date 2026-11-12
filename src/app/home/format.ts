/*
 * Numbers for the Today screen in the app language. Some embedded browsers accept the Bosnian
 * locale but ship no number data and print a decimal point, so the digits come from Intl in
 * a neutral locale and the separators from this table (the approach of lib/dates).
 */

const DECIMAL: Readonly<Record<string, string>> = { bs: ',', en: '.' };

/** 2.456 -> "2.5" or "2,5"; whole numbers keep no decimals. */
export function formatDecimal(value: number, language: string, digits = 1): string {
  const rounded = Number(value.toFixed(digits));
  const text = Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toFixed(digits).replace(/0+$/, '');
  return text.replace('.', DECIMAL[language] ?? '.');
}

const GROUP: Readonly<Record<string, string>> = { bs: '.', en: ',' };

/** 2850 -> "2,850" or "2.850": whole counts with thousands grouped. */
export function formatCount(value: number, language: string): string {
  return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, GROUP[language] ?? ',');
}

/** Narrow no-break space: Bosnian writes the sign apart, and it must never wrap alone. */
const NARROW_SPACE = String.fromCharCode(0x202f);

/** 0.826 -> "83%" in English, "83" + narrow space + "%" in Bosnian. */
export function formatPercent(share: number, language: string): string {
  const whole = String(Math.round(share * 100));
  return language === 'bs' ? `${whole}${NARROW_SPACE}%` : `${whole}%`;
}

/** Chance quality stored in 1/10,000 of a goal, shown as xG with two decimals at most. */
export function formatXg(units: number, language: string): string {
  return formatDecimal(units / 10_000, language, 2);
}
