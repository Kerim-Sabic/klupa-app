import { describe, expect, it } from 'vitest';
import { formatChance, formatMatchDate, KIND_ICON, localesFor } from './format';
import { EVENT_KINDS } from './weights';

describe('format', () => {
  it('falls back from Bosnian to Croatian locale data', () => {
    expect(localesFor('bs')).toEqual(['bs-BA', 'hr-BA', 'hr']);
    expect(localesFor('en')).toEqual(['en']);
  });

  it('shows chance quality as a whole percent', () => {
    expect(formatChance(1234, 'en')).toBe('12%');
    expect(formatChance(700, 'bs')).toMatch(/^7\s?%$/);
  });

  it('formats a match date as the calendar day it is', () => {
    expect(formatMatchDate('2026-11-14', 'en')).toBe('Sat, 14 Nov 2026');
    expect(formatMatchDate('2026-11-14', 'bs')).toBe('sub, 14. nov 2026.');
    expect(formatMatchDate('not-a-date', 'en')).toBe('not-a-date');
  });

  it('has one distinct icon per kind', () => {
    const icons = EVENT_KINDS.map((kind) => KIND_ICON[kind]);
    expect(new Set(icons).size).toBe(EVENT_KINDS.length);
  });
});
