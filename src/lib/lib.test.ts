import { describe, expect, it } from 'vitest';
import { parseEnv } from './env';
import { errorKey } from './errors';

const url = 'https://abc.supabase.co';
const jwt = (role: string): string =>
  `${btoa('{"alg":"HS256","typ":"JWT"}')}.${btoa(JSON.stringify({ role }))}.signature-part`;

describe('parseEnv', () => {
  it('accepts a project URL and a publishable key', () => {
    const key = 'sb_publishable_abcdefghijklmnop';
    expect(parseEnv({ VITE_SUPABASE_URL: url, VITE_SUPABASE_PUBLISHABLE_KEY: key })).toEqual({
      supabaseUrl: url,
      supabaseKey: key,
      release: 'local',
      disabled: new Set(),
    });
  });

  it('accepts a legacy anon key', () => {
    const key = jwt('anon');
    expect(
      parseEnv({ VITE_SUPABASE_URL: url, VITE_SUPABASE_PUBLISHABLE_KEY: key }).supabaseKey,
    ).toBe(key);
  });

  it('refuses to start without configuration and names what is missing', () => {
    expect(() => parseEnv({})).toThrow(/VITE_SUPABASE_URL.*VITE_SUPABASE_PUBLISHABLE_KEY/);
    expect(() =>
      parseEnv({ VITE_SUPABASE_URL: 'not a url', VITE_SUPABASE_PUBLISHABLE_KEY: 'x'.repeat(30) }),
    ).toThrow(/VITE_SUPABASE_URL/);
  });

  it('refuses a secret key, in either format', () => {
    for (const key of ['sb_secret_abcdefghijklmnopqrstuvwxyz', jwt('service_role')]) {
      expect(() =>
        parseEnv({ VITE_SUPABASE_URL: url, VITE_SUPABASE_PUBLISHABLE_KEY: key }),
      ).toThrow(/secret key/);
    }
  });

  it('treats a key that is not a readable JWT as opaque', () => {
    const key = 'aaaaaaaaaaaaaaaaaaaa.%%%not-base64%%%.bbbb';
    expect(
      parseEnv({ VITE_SUPABASE_URL: url, VITE_SUPABASE_PUBLISHABLE_KEY: key }).supabaseKey,
    ).toBe(key);
    const noRole = `${btoa('{}')}.${btoa('"just a string"')}.cccccccccccc`;
    expect(
      parseEnv({ VITE_SUPABASE_URL: url, VITE_SUPABASE_PUBLISHABLE_KEY: noRole }).supabaseKey,
    ).toBe(noRole);
  });
});

describe('errorKey', () => {
  it('maps deliberate database errors to messages a coach can act on', () => {
    expect(errorKey({ code: '42501' })).toBe('errors.forbidden');
    expect(errorKey({ code: 'PGRST301' })).toBe('errors.forbidden');
    expect(errorKey({ code: '54000' })).toBe('errors.rateLimited');
    expect(errorKey({ code: 'over_email_send_rate_limit' })).toBe('errors.rateLimited');
    expect(errorKey({ code: '23505' })).toBe('errors.duplicate');
    expect(errorKey({ code: '23514' })).toBe('errors.invalid');
    expect(errorKey({ code: 'otp_expired' })).toBe('errors.invalid');
  });

  it('treats a failed fetch as being offline', () => {
    expect(errorKey(new TypeError('Failed to fetch'))).toBe('errors.offline');
  });

  it('never leaks unknown server text', () => {
    expect(errorKey({ code: 'XX000', message: 'internal detail' })).toBe('errors.unknown');
    expect(errorKey({ code: 42 })).toBe('errors.unknown');
    expect(errorKey('boom')).toBe('errors.unknown');
    expect(errorKey(null)).toBe('errors.unknown');
  });
});
