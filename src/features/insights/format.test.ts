import { describe, expect, it } from 'vitest';
import { createFormatter } from './format';

describe('createFormatter', () => {
  const en = createFormatter('en');
  const bs = createFormatter('bs');

  it('formats numbers with the language separators, dropping needless decimals', () => {
    expect(en.number(1234.56)).toBe('1,234.6');
    expect(bs.number(1234.56)).toBe('1.234,6');
    expect(en.number(45)).toBe('45');
    expect(bs.number(0.5, 2)).toBe('0,50');
  });

  it('always shows the sign except for zero', () => {
    expect(en.signed(3.5)).toBe('+3.5');
    expect(en.signed(-2)).toBe('-2');
    expect(en.signed(0)).toBe('0');
    expect(bs.signed(-0.04, 1)).toBe('0,0');
    expect(bs.signed(22.5)).toBe('+22,5');
  });

  it('formats shares as percentages, signed or not', () => {
    expect(en.percent(0.583)).toBe('58%');
    expect(bs.percent(0.0525, 1)).toBe('5,3%');
    expect(en.signedPercent(0.8)).toBe('+80%');
    expect(en.signedPercent(-0.2)).toBe('-20%');
    expect(en.signedPercent(0)).toBe('0%');
  });

  it('writes a calendar date without letting the time zone move it', () => {
    expect(en.shortDate('2026-11-09')).toBe('9 Nov 2026');
    expect(bs.shortDate('2026-11-09')).toBe('9. nov 2026.');
  });

  it('falls back to point and comma for a language it has no table for', () => {
    expect(createFormatter('de').number(1234.5)).toBe('1,234.5');
  });
});
