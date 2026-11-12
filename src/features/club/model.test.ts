import { describe, expect, it } from 'vitest';
import {
  DECIMAL_SPECS,
  REFERENCE_VALUES,
  canManage,
  charCount,
  consentStamp,
  fieldsFrom,
  emptyFields,
  formatDate,
  formatDateTime,
  isOwner,
  parseDecimal,
  toInputText,
  todayIso,
  validatePlayer,
  validateSettings,
  withError,
  type PlayerFields,
} from './model';
import { makePlayer } from './test-utils';

const others = [
  { id: 'a', label: 'Soko', shirt_number: 7 },
  { id: 'b', label: 'Vuk', shirt_number: 9 },
];

function fields(patch: Partial<PlayerFields> = {}): PlayerFields {
  return { ...emptyFields(), label: 'Iskra', shirt: '10', ...patch };
}

describe('roles', () => {
  it('lets owners and coaches manage, and only owners own', () => {
    expect(canManage('owner')).toBe(true);
    expect(canManage('coach')).toBe(true);
    expect(canManage('assistant')).toBe(false);
    expect(canManage('viewer')).toBe(false);
    expect(isOwner('owner')).toBe(true);
    expect(isOwner('coach')).toBe(false);
  });
});

describe('validatePlayer', () => {
  it('accepts a label and a free shirt number and trims the label', () => {
    const result = validatePlayer(fields({ label: '  Iskra  ', quarter: '3' }), others, null);
    expect(result.values).toEqual({
      label: 'Iskra',
      shirtNumber: 10,
      consent: 'not_recorded',
      birthQuarter: 3,
    });
  });

  it('treats a missing quarter as null', () => {
    expect(validatePlayer(fields(), others, null).values?.birthQuarter).toBeNull();
  });

  it('refuses an empty label and one over 40 characters', () => {
    expect(validatePlayer(fields({ label: '   ' }), others, null).errors).toEqual({
      label: 'labelLength',
    });
    expect(validatePlayer(fields({ label: 'x'.repeat(41) }), others, null).errors.label).toBe(
      'labelLength',
    );
    expect(validatePlayer(fields({ label: 'x'.repeat(40) }), others, null).values).not.toBeNull();
  });

  it('counts characters the way the database does', () => {
    expect(charCount('Žuti')).toBe(4);
    expect(charCount('😀'.repeat(40))).toBe(40);
    expect(validatePlayer(fields({ label: '😀'.repeat(41) }), others, null).errors.label).toBe(
      'labelLength',
    );
  });

  it.each(['', '0', '100', 'abc', '1.5', '-3', ' ', '007x'])(
    'refuses the shirt number "%s"',
    (shirt) => {
      expect(validatePlayer(fields({ shirt }), others, null).errors.shirt).toBe('shirtInvalid');
    },
  );

  it('accepts the edges 1 and 99', () => {
    expect(validatePlayer(fields({ shirt: '1' }), others, null).values?.shirtNumber).toBe(1);
    expect(validatePlayer(fields({ shirt: '99' }), others, null).values?.shirtNumber).toBe(99);
  });

  it('refuses a number another active player wears, and names who', () => {
    const result = validatePlayer(fields({ shirt: '7' }), others, null);
    expect(result.errors).toEqual({ shirt: 'shirtTaken', takenBy: 'Soko' });
  });

  it('lets a player keep their own number when editing', () => {
    expect(validatePlayer(fields({ shirt: '7' }), others, 'a').values?.shirtNumber).toBe(7);
  });

  it('reports both problems together', () => {
    const result = validatePlayer(fields({ label: '', shirt: 'x' }), others, null);
    expect(result.errors).toEqual({ label: 'labelLength', shirt: 'shirtInvalid' });
  });
});

describe('fields', () => {
  it('starts empty with consent not recorded', () => {
    expect(emptyFields()).toEqual({ label: '', shirt: '', consent: 'not_recorded', quarter: '' });
  });

  it('is filled from a player', () => {
    expect(fieldsFrom(makePlayer({ birth_quarter: 4 }))).toEqual({
      label: 'Soko',
      shirt: '7',
      consent: 'granted',
      quarter: '4',
    });
    expect(fieldsFrom(makePlayer({ birth_quarter: null })).quarter).toBe('');
  });
});

describe('consentStamp', () => {
  const now = new Date('2026-11-12T10:00:00Z');
  it('is null exactly when consent is not recorded', () => {
    expect(consentStamp('not_recorded', now)).toBeNull();
    expect(consentStamp('granted', now)).toBe('2026-11-12T10:00:00.000Z');
    expect(consentStamp('withdrawn', now)).toBe('2026-11-12T10:00:00.000Z');
  });
});

describe('parseDecimal', () => {
  const spec = DECIMAL_SPECS.tariff;

  it('reads an empty field as "not set"', () => {
    expect(parseDecimal('', spec)).toEqual({ ok: true, value: null });
    expect(parseDecimal('   ', spec)).toEqual({ ok: true, value: null });
  });

  it('accepts a point or a comma', () => {
    expect(parseDecimal('0.3020', spec)).toEqual({ ok: true, value: 0.302 });
    expect(parseDecimal('0,5706', spec)).toEqual({ ok: true, value: 0.5706 });
    expect(parseDecimal('12', spec)).toEqual({ ok: true, value: 12 });
    expect(parseDecimal('0', spec)).toEqual({ ok: true, value: 0 });
  });

  it.each(['-1', 'abc', '1e3', '1.', '.5', '1,2,3', '+4'])('refuses "%s"', (text) => {
    expect(parseDecimal(text, spec)).toEqual({ ok: false, error: 'decimalInvalid' });
  });

  it('refuses more decimals than the column holds, but ignores trailing zeros', () => {
    expect(parseDecimal('0.30201', spec)).toEqual({ ok: false, error: 'decimalTooPrecise' });
    expect(parseDecimal('0.302000', spec)).toEqual({ ok: true, value: 0.302 });
    expect(parseDecimal('1.234', DECIMAL_SPECS.floodlightKw)).toEqual({
      ok: false,
      error: 'decimalTooPrecise',
    });
  });

  it('refuses a value the column cannot hold', () => {
    expect(parseDecimal('100', DECIMAL_SPECS.carbon)).toEqual({
      ok: false,
      error: 'decimalTooLarge',
    });
    expect(parseDecimal('99.9999', DECIMAL_SPECS.carbon)).toEqual({ ok: true, value: 99.9999 });
    expect(parseDecimal('10000', DECIMAL_SPECS.floodlightKw).ok).toBe(false);
  });
});

describe('validateSettings', () => {
  const valid = { name: 'FK Sunce', floodlightKw: '4,5', tariff: '', carbon: '0.5706' };

  it('returns the numbers and trims the name', () => {
    expect(validateSettings({ ...valid, name: '  FK Sunce ' }).values).toEqual({
      name: 'FK Sunce',
      floodlightKw: 4.5,
      tariff: null,
      carbon: 0.5706,
    });
  });

  it('refuses a name under 2 or over 80 characters', () => {
    expect(validateSettings({ ...valid, name: 'A' }).errors).toEqual({ name: 'nameLength' });
    expect(validateSettings({ ...valid, name: 'x'.repeat(81) }).errors).toEqual({
      name: 'nameLength',
    });
    expect(validateSettings({ ...valid, name: 'x'.repeat(80) }).values).not.toBeNull();
  });

  it('collects every bad field at once', () => {
    const result = validateSettings({
      name: '',
      floodlightKw: 'x',
      tariff: '0.00001',
      carbon: '500',
    });
    expect(result.errors).toEqual({
      name: 'nameLength',
      floodlightKw: 'decimalInvalid',
      tariff: 'decimalTooPrecise',
      carbon: 'decimalTooLarge',
    });
  });

  it('knows the Bosnia and Herzegovina reference values', () => {
    expect(REFERENCE_VALUES).toEqual({ tariff: '0.3020', carbon: '0.5706' });
  });
});

describe('formatting', () => {
  it('writes numbers with the language decimal mark', () => {
    expect(toInputText(0.302, 'bs')).toBe('0,302');
    expect(toInputText(0.302, 'en')).toBe('0.302');
    expect(toInputText('0.3020', 'bs')).toBe('0,3020');
    expect(toInputText(null, 'bs')).toBe('');
    expect(toInputText(5, 'de')).toBe('5');
  });

  it('formats dates and times', () => {
    // Local noon and 18:04 so the viewer's time zone cannot move the day.
    const noon = new Date(2026, 10, 7, 12, 0).toISOString();
    const evening = new Date(2026, 10, 7, 18, 4).toISOString();
    expect(formatDate(noon, 'en')).toBe('7 Nov 2026');
    expect(formatDate(noon, 'bs')).toBe('7. nov 2026.');
    expect(formatDateTime(evening, 'en')).toBe('7 Nov 2026, 18:04');
    expect(formatDateTime(evening, 'bs')).toBe('7. nov 2026. 18:04');
  });

  it('writes the local calendar date', () => {
    expect(todayIso(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(todayIso(new Date(2026, 10, 12, 0, 1))).toBe('2026-11-12');
  });

  it('leaves the error prop out when there is no message', () => {
    expect(withError(undefined)).toEqual({});
    expect(withError('Nope')).toEqual({ error: 'Nope' });
  });
});
