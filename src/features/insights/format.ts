import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDate } from '../../lib/dates';

/*
 * Numbers through `Intl`, in the app language. Some embedded browsers accept the
 * Bosnian locale but ship no number data and quietly print a decimal point, so Intl
 * formats the digits and our own table supplies the separators. Dates come from
 * `lib/dates`.
 */

const SEPARATORS: Readonly<Record<string, { decimal: string; group: string }>> = {
  bs: { decimal: ',', group: '.' },
  en: { decimal: '.', group: ',' },
};
const FALLBACK = { decimal: '.', group: ',' };

export interface Formatter {
  /** 12.5 -> "12.5" or "12,5". Whole numbers get no decimals unless `digits` is given. */
  number: (value: number, digits?: number) => string;
  /** Always shows the sign except for zero: "+3.5", "-2", "0". */
  signed: (value: number, digits?: number) => string;
  /** 0.583 -> "58%". */
  percent: (share: number, digits?: number) => string;
  /** 0.34 -> "+34%", -0.2 -> "-20%", 0 -> "0%". */
  signedPercent: (share: number, digits?: number) => string;
  /** '2026-11-09' -> "9 Nov 2026" or "9. nov 2026.". Read as a calendar date, so the time zone cannot shift it. */
  shortDate: (isoDate: string) => string;
}

export function createFormatter(language: string): Formatter {
  const separators = SEPARATORS[language] ?? FALLBACK;
  const render = (options: Intl.NumberFormatOptions, value: number): string =>
    new Intl.NumberFormat('en', options)
      .formatToParts(value)
      .map((part) =>
        part.type === 'decimal'
          ? separators.decimal
          : part.type === 'group'
            ? separators.group
            : part.value,
      )
      .join('');
  const fixed = (digits: number): Intl.NumberFormatOptions => ({
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return {
    number: (value, digits) =>
      render(digits === undefined ? { maximumFractionDigits: 1 } : fixed(digits), value),
    signed: (value, digits) =>
      render(
        {
          ...(digits === undefined ? { maximumFractionDigits: 1 } : fixed(digits)),
          signDisplay: 'exceptZero',
        },
        value,
      ),
    percent: (share, digits = 0) => render({ style: 'percent', ...fixed(digits) }, share),
    signedPercent: (share, digits = 0) =>
      render({ style: 'percent', ...fixed(digits), signDisplay: 'exceptZero' }, share),
    shortDate: (isoDate) => formatDate(isoDate, language, 'medium'),
  };
}

export function useFormatter(): Formatter {
  const { i18n } = useTranslation();
  return useMemo(() => createFormatter(i18n.language), [i18n.language]);
}
