import { afterEach, describe, expect, it } from 'vitest';
import { formatDate } from './dates';

const STYLES = ['medium', 'long', 'weekday', 'dateTime'] as const;
const SATURDAY = new Date(2026, 10, 7, 18, 4);
const ORIGINAL_TZ = process.env.TZ;

afterEach(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

describe('formatDate', () => {
  it('writes every style in Bosnian from our own tables', () => {
    expect(formatDate(SATURDAY, 'bs', 'medium')).toBe('7. nov 2026.');
    expect(formatDate(SATURDAY, 'bs', 'long')).toBe('7. novembar 2026.');
    expect(formatDate(SATURDAY, 'bs', 'weekday')).toBe('sub, 7. nov 2026.');
    expect(formatDate(SATURDAY, 'bs', 'dateTime')).toBe('7. nov 2026. 18:04');
  });

  it('writes every style in English as en-GB', () => {
    expect(formatDate(SATURDAY, 'en', 'medium')).toBe('7 Nov 2026');
    expect(formatDate(SATURDAY, 'en', 'long')).toBe('7 November 2026');
    expect(formatDate(SATURDAY, 'en', 'weekday')).toBe('Sat, 7 Nov 2026');
    expect(formatDate(SATURDAY, 'en', 'dateTime')).toBe('7 Nov 2026, 18:04');
  });

  it('reads any other language as English', () => {
    expect(formatDate(SATURDAY, 'de', 'long')).toBe('7 November 2026');
  });

  it('zero-pads the hour and the minutes', () => {
    const early = new Date(2026, 0, 5, 7, 5);
    expect(formatDate(early, 'bs', 'dateTime')).toBe('5. jan 2026. 07:05');
    expect(formatDate(early, 'en', 'dateTime')).toBe('5 Jan 2026, 07:05');
  });

  it('names Sunday first and the months', () => {
    expect(formatDate('2026-11-08', 'bs', 'weekday')).toBe('ned, 8. nov 2026.');
    expect(formatDate('2026-12-31', 'bs', 'long')).toBe('31. decembar 2026.');
    expect(formatDate('2026-05-01', 'bs', 'medium')).toBe('1. maj 2026.');
  });

  it.each(['America/Los_Angeles', 'Pacific/Honolulu', 'Asia/Tokyo', 'Europe/Sarajevo'])(
    'never shifts a date-only string in %s',
    (zone) => {
      // `new Date('2026-11-07')` is midnight UTC, which is the 6th in any negative-offset zone.
      process.env.TZ = zone;
      expect(formatDate('2026-11-07', 'bs', 'weekday')).toBe('sub, 7. nov 2026.');
      expect(formatDate('2026-11-07', 'bs', 'long')).toBe('7. novembar 2026.');
      expect(formatDate('2026-11-07', 'en', 'weekday')).toBe('Sat, 7 Nov 2026');
      expect(formatDate('2026-11-07', 'en', 'medium')).toBe('7 Nov 2026');
    },
  );

  it('shows a timestamp in the viewer local time', () => {
    process.env.TZ = 'Asia/Tokyo';
    expect(formatDate('2026-11-07T20:30:00Z', 'bs', 'dateTime')).toBe('8. nov 2026. 05:30');
    expect(formatDate('2026-11-07T20:30:00Z', 'en', 'dateTime')).toBe('8 Nov 2026, 05:30');
  });

  it('returns an empty string for invalid input', () => {
    for (const language of ['bs', 'en']) {
      for (const style of STYLES) {
        expect(formatDate('', language, style)).toBe('');
        expect(formatDate('not-a-date', language, style)).toBe('');
        expect(formatDate('2026-02-30', language, style)).toBe('');
        expect(formatDate(new Date(Number.NaN), language, style)).toBe('');
      }
    }
  });
});
