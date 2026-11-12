import type { Player } from '../../lib/data';
import { formatDate as formatLibDate } from '../../lib/dates';
import type { Enums } from '../../lib/supabase';

/** Query keys owned by this feature. Shared reads (players, matches, ...) live in lib/data. */
export const clubKeys = {
  settings: (clubId: string) => ['club-settings', clubId] as const,
  requests: (clubId: string) => ['club-data-requests', clubId] as const,
  audit: (clubId: string) => ['club-audit', clubId] as const,
};

/** Reads that depend on the roster; refreshed after an erase or a sample season. */
export const ROSTER_DEPENDENT_KEYS = [
  'matches',
  'match',
  'match-events',
  'stints',
  'team-stints',
  'sessions',
  'session',
  'attendance',
  'observations',
] as const;

export type Role = Enums['member_role'];
export type ConsentValue = Enums['consent_status'];

/** Owners and coaches manage the roster and read the activity log (see `app.can_manage`). */
export function canManage(role: Role): boolean {
  return role === 'owner' || role === 'coach';
}

export function isOwner(role: Role): boolean {
  return role === 'owner';
}

/** Characters as the database counts them (code points), so an emoji is one, not two. */
export function charCount(text: string): number {
  return Array.from(text).length;
}

/** Props for a field's `error`, which must be left out (not undefined) when there is none. */
export function withError(message: string | undefined): { error?: string } {
  return message === undefined ? {} : { error: message };
}

/* ---------------------------------------------------------------- squad */

export const LABEL_MAX = 40;
export const CONSENT_VALUES: readonly ConsentValue[] = ['not_recorded', 'granted', 'withdrawn'];
export const QUARTERS = [1, 2, 3, 4] as const;

export interface PlayerFields {
  readonly label: string;
  readonly shirt: string;
  readonly consent: ConsentValue;
  /** '' for not given, otherwise '1' to '4'. */
  readonly quarter: string;
}

export interface PlayerValues {
  readonly label: string;
  readonly shirtNumber: number;
  readonly consent: ConsentValue;
  readonly birthQuarter: number | null;
}

/** `shirtConflict` comes from the database when someone else took the number a moment ago. */
export type PlayerErrorKey = 'labelLength' | 'shirtInvalid' | 'shirtTaken' | 'shirtConflict';

export interface PlayerErrors {
  readonly label?: PlayerErrorKey;
  readonly shirt?: PlayerErrorKey;
  /** Who already wears the number, for the message. */
  readonly takenBy?: string;
}

export type PlayerValidation =
  | { readonly values: PlayerValues; readonly errors: Record<string, never> }
  | { readonly values: null; readonly errors: PlayerErrors };

export function emptyFields(): PlayerFields {
  return { label: '', shirt: '', consent: 'not_recorded', quarter: '' };
}

export function fieldsFrom(player: Player): PlayerFields {
  return {
    label: player.label,
    shirt: String(player.shirt_number),
    consent: player.consent,
    quarter: player.birth_quarter === null ? '' : String(player.birth_quarter),
  };
}

/**
 * Checks a form before anything is sent. `others` are the players already in the squad;
 * the one being edited is skipped so keeping your own number is not a clash.
 */
export function validatePlayer(
  fields: PlayerFields,
  others: readonly Pick<Player, 'id' | 'label' | 'shirt_number'>[],
  editingId: string | null,
): PlayerValidation {
  const label = fields.label.trim();
  const errors: { label?: PlayerErrorKey; shirt?: PlayerErrorKey; takenBy?: string } = {};
  const labelLength = charCount(label);
  if (labelLength < 1 || labelLength > LABEL_MAX) errors.label = 'labelLength';

  const shirtText = fields.shirt.trim();
  const shirtNumber = /^\d{1,2}$/.test(shirtText) ? Number(shirtText) : Number.NaN;
  if (!Number.isInteger(shirtNumber) || shirtNumber < 1 || shirtNumber > 99) {
    errors.shirt = 'shirtInvalid';
  } else {
    const clash = others.find(
      (other) => other.id !== editingId && other.shirt_number === shirtNumber,
    );
    if (clash !== undefined) {
      errors.shirt = 'shirtTaken';
      errors.takenBy = clash.label;
    }
  }

  if (errors.label !== undefined || errors.shirt !== undefined) return { values: null, errors };
  return {
    values: {
      label,
      shirtNumber,
      consent: fields.consent,
      birthQuarter: fields.quarter === '' ? null : Number(fields.quarter),
    },
    errors: {},
  };
}

/** The database requires `consent_recorded_at` to be null exactly when nothing is recorded. */
export function consentStamp(consent: ConsentValue, now: Date): string | null {
  return consent === 'not_recorded' ? null : now.toISOString();
}

/* ------------------------------------------------------------- settings */

export interface DecimalSpec {
  readonly max: number;
  readonly places: number;
}

/** Limits of the `numeric(p, s)` columns, so a value the database would refuse is caught here. */
export const DECIMAL_SPECS = {
  floodlightKw: { max: 9999.99, places: 2 },
  tariff: { max: 9999.9999, places: 4 },
  carbon: { max: 99.9999, places: 4 },
} as const satisfies Record<string, DecimalSpec>;

/** Bosnia and Herzegovina reference values, as typed into the form. */
export const REFERENCE_VALUES = { tariff: '0.3020', carbon: '0.5706' } as const;

export type DecimalErrorKey = 'decimalInvalid' | 'decimalTooLarge' | 'decimalTooPrecise';

export type DecimalResult =
  | { readonly ok: true; readonly value: number | null }
  | { readonly ok: false; readonly error: DecimalErrorKey };

/** Empty means "not set". Accepts a decimal point or comma; never a sign or an exponent. */
export function parseDecimal(text: string, spec: DecimalSpec): DecimalResult {
  const trimmed = text.trim();
  if (trimmed === '') return { ok: true, value: null };
  if (!/^\d+(?:[.,]\d+)?$/.test(trimmed)) return { ok: false, error: 'decimalInvalid' };
  const normalised = trimmed.replace(',', '.');
  const fraction = (normalised.split('.')[1] ?? '').replace(/0+$/, '');
  if (fraction.length > spec.places) return { ok: false, error: 'decimalTooPrecise' };
  const value = Number(normalised);
  if (value > spec.max) return { ok: false, error: 'decimalTooLarge' };
  return { ok: true, value };
}

export interface SettingsFields {
  readonly name: string;
  readonly floodlightKw: string;
  readonly tariff: string;
  readonly carbon: string;
}

export interface SettingsValues {
  readonly name: string;
  readonly floodlightKw: number | null;
  readonly tariff: number | null;
  readonly carbon: number | null;
}

export type SettingsField = 'name' | 'floodlightKw' | 'tariff' | 'carbon';
export type SettingsErrors = Partial<Record<SettingsField, 'nameLength' | DecimalErrorKey>>;

export type SettingsValidation =
  | { readonly values: SettingsValues; readonly errors: Record<string, never> }
  | { readonly values: null; readonly errors: SettingsErrors };

export function validateSettings(fields: SettingsFields): SettingsValidation {
  const errors: { -readonly [K in SettingsField]?: 'nameLength' | DecimalErrorKey } = {};
  const name = fields.name.trim();
  const nameLength = charCount(name);
  if (nameLength < 2 || nameLength > 80) errors.name = 'nameLength';

  const numbers: Record<Exclude<SettingsField, 'name'>, number | null> = {
    floodlightKw: null,
    tariff: null,
    carbon: null,
  };
  const inputs = [
    ['floodlightKw', fields.floodlightKw],
    ['tariff', fields.tariff],
    ['carbon', fields.carbon],
  ] as const;
  for (const [field, text] of inputs) {
    const result = parseDecimal(text, DECIMAL_SPECS[field]);
    if (result.ok) numbers[field] = result.value;
    else errors[field] = result.error;
  }
  if (Object.keys(errors).length > 0) return { values: null, errors };
  return { values: { name, ...numbers }, errors: {} };
}

const DECIMAL_SEPARATOR: Readonly<Record<string, string>> = { bs: ',', en: '.' };

/** A stored number as it should appear in a text field: the language's own decimal mark. */
export function toInputText(value: number | string | null, language: string): string {
  if (value === null) return '';
  return String(value).replace('.', DECIMAL_SEPARATOR[language] ?? '.');
}

/* ---------------------------------------------------------------- dates */

export function formatDateTime(iso: string, language: string): string {
  return formatLibDate(iso, language, 'dateTime');
}

export function formatDate(iso: string, language: string): string {
  return formatLibDate(iso, language, 'medium');
}

/** Local calendar date as 'YYYY-MM-DD'. The caller supplies the clock. */
export function todayIso(now: Date): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${String(now.getFullYear())}-${month}-${day}`;
}
