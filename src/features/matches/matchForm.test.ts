import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PERIOD_MINUTES,
  initialValues,
  todayIso,
  validateMatch,
  type MatchValues,
} from './matchForm';

const valid: MatchValues = {
  opponent: '  Željezničar  ',
  playedOn: '2026-11-14',
  periodCount: '2',
  periodMinutes: '25',
};

describe('defaults', () => {
  it('uses the usual period length per age group', () => {
    expect(DEFAULT_PERIOD_MINUTES).toEqual({
      u7: 20,
      u9: 20,
      u11: 25,
      u13: 30,
      u15: 35,
      u17: 40,
      u19: 45,
      senior: 45,
    });
  });

  it('starts with today, two periods and the age-group minutes', () => {
    const now = new Date(2026, 10, 4, 23, 30);
    expect(todayIso(now)).toBe('2026-11-04');
    expect(initialValues('u15', now)).toEqual({
      opponent: '',
      playedOn: '2026-11-04',
      periodCount: '2',
      periodMinutes: '35',
    });
  });
});

describe('validateMatch', () => {
  it('accepts a valid values and trims the opponent', () => {
    expect(validateMatch(valid)).toEqual({
      ok: true,
      value: { opponent: 'Željezničar', playedOn: '2026-11-14', periodCount: 2, periodMinutes: 25 },
    });
  });

  it('requires an opponent of at most 60 characters', () => {
    expect(validateMatch({ ...valid, opponent: '   ' })).toEqual({
      ok: false,
      errors: { opponent: 'opponentRequired' },
    });
    expect(validateMatch({ ...valid, opponent: 'x'.repeat(61) })).toEqual({
      ok: false,
      errors: { opponent: 'opponentTooLong' },
    });
    expect(validateMatch({ ...valid, opponent: 'x'.repeat(60) }).ok).toBe(true);
  });

  it('requires a real date', () => {
    for (const playedOn of ['', '2026-02-30', '14.11.2026', '2026-13-01']) {
      expect(validateMatch({ ...valid, playedOn })).toEqual({
        ok: false,
        errors: { playedOn: 'dateRequired' },
      });
    }
  });

  it('keeps periods between 1 and 4 and minutes between 5 and 60', () => {
    expect(validateMatch({ ...valid, periodCount: '5' })).toEqual({
      ok: false,
      errors: { periodCount: 'periodsRange' },
    });
    expect(validateMatch({ ...valid, periodCount: '0' }).ok).toBe(false);
    for (const periodMinutes of ['4', '61', '', '20.5', '-10', 'abc']) {
      expect(validateMatch({ ...valid, periodMinutes })).toEqual({
        ok: false,
        errors: { periodMinutes: 'minutesRange' },
      });
    }
    expect(validateMatch({ ...valid, periodCount: '1', periodMinutes: '5' }).ok).toBe(true);
    expect(validateMatch({ ...valid, periodCount: '4', periodMinutes: '60' }).ok).toBe(true);
  });

  it('reports every problem at once', () => {
    const result = validateMatch({
      opponent: '',
      playedOn: '',
      periodCount: '9',
      periodMinutes: '1',
    });
    expect(result).toEqual({
      ok: false,
      errors: {
        opponent: 'opponentRequired',
        playedOn: 'dateRequired',
        periodCount: 'periodsRange',
        periodMinutes: 'minutesRange',
      },
    });
  });
});
