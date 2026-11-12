import { describe, expect, it } from 'vitest';
import { parseEnv } from './env';
import { FLAGS, isEnabled, parseDisabled } from './flags';

describe('parseDisabled', () => {
  it('switches nothing off when the setting is missing or empty', () => {
    for (const setting of [undefined, '', '  ', ',']) {
      const disabled = parseDisabled(setting);
      for (const flag of FLAGS) expect(isEnabled(flag, disabled)).toBe(true);
    }
  });

  it('switches off exactly the features that are named', () => {
    const disabled = parseDisabled('labs, liveFeed');
    expect(isEnabled('labs', disabled)).toBe(false);
    expect(isEnabled('liveFeed', disabled)).toBe(false);
    expect(isEnabled('errorReports', disabled)).toBe(true);
  });

  it('ignores names it does not know, so a typo cannot switch anything off', () => {
    const disabled = parseDisabled('lab,LABS,everything');
    expect(disabled.size).toBe(0);
  });
});

describe('the setting as the app reads it', () => {
  const base = {
    VITE_SUPABASE_URL: 'https://unit-tests.supabase.co',
    VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_unit_tests_only_000000',
  };

  it('is empty unless the host sets it', () => {
    expect(parseEnv(base).disabled.size).toBe(0);
    expect([...parseEnv({ ...base, VITE_DISABLED_FEATURES: 'labs' }).disabled]).toEqual(['labs']);
  });
});
