/*
 * Dates in the app language. Some browsers (embedded WebViews, the in-app browser) accept
 * the Bosnian locale but ship no data for it and print text like "2026 M11 7, Sat". So
 * Bosnian is written from our own tables and never from `Intl`; every other language reads
 * as en-GB. Same reason and approach as `formatDecimal` in the momentum chart model.
 */

export type DateStyle = 'medium' | 'long' | 'weekday' | 'dateTime';

const MONTHS_BS = [
  'januar',
  'februar',
  'mart',
  'april',
  'maj',
  'juni',
  'juli',
  'august',
  'septembar',
  'oktobar',
  'novembar',
  'decembar',
] as const;

const MONTHS_SHORT_BS = [
  'jan',
  'feb',
  'mar',
  'apr',
  'maj',
  'jun',
  'jul',
  'aug',
  'sep',
  'okt',
  'nov',
  'dec',
] as const;

/** Sunday first, as `Date#getDay` counts. */
const WEEKDAYS_SHORT_BS = ['ned', 'pon', 'uto', 'sri', 'čet', 'pet', 'sub'] as const;

const EN_OPTIONS: Readonly<Record<DateStyle, Intl.DateTimeFormatOptions>> = {
  medium: { day: 'numeric', month: 'short', year: 'numeric' },
  long: { day: 'numeric', month: 'long', year: 'numeric' },
  weekday: { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' },
  dateTime: {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  },
};

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

interface Parts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly weekday: number;
  readonly hour: number;
  readonly minute: number;
}

const pad = (value: number): string => String(value).padStart(2, '0');

/** Calendar parts of a moment, read in UTC (date-only input) or in the viewer's time zone. */
function partsOf(date: Date, utc: boolean): Parts {
  return utc
    ? {
        year: date.getUTCFullYear(),
        month: date.getUTCMonth(),
        day: date.getUTCDate(),
        weekday: date.getUTCDay(),
        hour: date.getUTCHours(),
        minute: date.getUTCMinutes(),
      }
    : {
        year: date.getFullYear(),
        month: date.getMonth(),
        day: date.getDate(),
        weekday: date.getDay(),
        hour: date.getHours(),
        minute: date.getMinutes(),
      };
}

function formatBosnian(parts: Parts, style: DateStyle): string {
  const day = String(parts.day);
  const year = `${String(parts.year)}.`;
  const short = `${day}. ${MONTHS_SHORT_BS[parts.month] ?? ''} ${year}`;
  switch (style) {
    case 'medium':
      return short;
    case 'long':
      return `${day}. ${MONTHS_BS[parts.month] ?? ''} ${year}`;
    case 'weekday':
      return `${WEEKDAYS_SHORT_BS[parts.weekday] ?? ''}, ${short}`;
    case 'dateTime':
      return `${short} ${pad(parts.hour)}:${pad(parts.minute)}`;
  }
}

/** A `YYYY-MM-DD` string as midnight UTC, or null if it is not a real calendar day. */
function parseDateOnly(value: string): Date | null {
  const match = DATE_ONLY.exec(value);
  if (match === null) return null;
  const [year, month, day] = match.slice(1).map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  const real =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return real ? date : null;
}

/**
 * Format a date in the app language. A date-only string is a calendar day and is never moved
 * by the time zone; a timestamp or a `Date` is shown in the viewer's local time. Invalid input
 * gives an empty string.
 */
export function formatDate(value: string | Date, language: string, style: DateStyle): string {
  const dateOnly = typeof value === 'string' && DATE_ONLY.test(value);
  let date: Date | null;
  if (typeof value !== 'string') date = value;
  else date = dateOnly ? parseDateOnly(value) : new Date(value);
  if (date === null || Number.isNaN(date.getTime())) return '';
  if (language === 'bs') return formatBosnian(partsOf(date, dateOnly), style);
  return new Intl.DateTimeFormat('en-GB', {
    ...EN_OPTIONS[style],
    ...(dateOnly ? { timeZone: 'UTC' } : {}),
  }).format(date);
}
