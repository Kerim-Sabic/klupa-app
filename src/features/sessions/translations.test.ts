import { describe, expect, it } from 'vitest';
import { DRILL_PHASES, EQUIPMENT, FOCUS_KEYS, PITCH_AREAS } from '../../data/drills';
import type { BlockReason, RejectionCode } from '../../engine';
import { messages, type Messages } from '../../i18n';
import type { FormErrorCode } from './constraints';
import type { SwitchMessageKey } from './switchPoints';

// Typed as records so a new planner code is a compile error here until it is translated.
const REASONS: Record<BlockReason, true> = {
  MATCHES_FOCUS: true,
  OTHER_FOCUS: true,
  FITS_PLAYERS: true,
  FITS_SPACE: true,
  MOST_REPS: true,
};
const REJECTIONS: Record<RejectionCode, true> = {
  TOO_FEW_PLAYERS: true,
  TOO_MANY_PLAYERS: true,
  NOT_ENOUGH_SPACE: true,
  AGE_GROUP: true,
  MISSING_EQUIPMENT: true,
};
const FORM_ERRORS: Record<FormErrorCode, true> = {
  UNKNOWN_FOCUS: true,
  INVALID_DATE: true,
  INVALID_PLAYERS: true,
  INVALID_MINUTES: true,
  UNKNOWN_AREA: true,
  UNKNOWN_EQUIPMENT: true,
};
const SWITCH_KEYS: Record<SwitchMessageKey, true> = {
  'sessions.fewer.change': true,
  'sessions.fewer.none': true,
  'sessions.fewer.appears': true,
};

function lookup(tree: Messages, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (node, part) =>
        typeof node === 'object' && node !== null ? (node as Messages)[part] : undefined,
      tree,
    );
}

const wanted = [
  ...FOCUS_KEYS.map((key) => `sessions.focus.${key}`),
  ...EQUIPMENT.map((key) => `sessions.equipment.${key}`),
  ...PITCH_AREAS.flatMap((key) => [`sessions.area.${key}`, `sessions.areaFull.${key}`]),
  ...DRILL_PHASES.map((key) => `sessions.phase.${key}`),
  ...['planned', 'completed', 'cancelled'].map((key) => `sessions.status.${key}`),
  ...['completed', 'cancelled'].map((key) => `sessions.status.saved.${key}`),
  ...Object.keys(REASONS).map((key) => `sessions.reason.${key}`),
  ...Object.keys(REJECTIONS).map((key) => `sessions.rejection.${key}`),
  ...Object.keys(FORM_ERRORS).map((key) => `sessions.formError.${key}`),
  ...Object.keys(SWITCH_KEYS),
];

describe('sessions translations', () => {
  it.each(['bs', 'en'] as const)('cover every code the screens can show in %s', (language) => {
    const missing = wanted.filter((path) => {
      const text = lookup(messages[language], path);
      return typeof text !== 'string' || text.trim() === '';
    });
    expect(missing).toEqual([]);
  });

  it('keep the Bosnian text different from the English', () => {
    const same = wanted.filter((path) => lookup(messages.bs, path) === lookup(messages.en, path));
    // Short loanwords can match ("Presing" differs, but a bare number or acronym could not).
    expect(same).toEqual([]);
  });
});
