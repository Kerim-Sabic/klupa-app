import { describe, expect, it } from 'vitest';
import { detectLanguage, mergeMessages, messages, type Messages } from './index';

function flatten(tree: Messages, prefix = ''): Map<string, string> {
  const entries = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix === '' ? key : `${prefix}.${key}`;
    if (typeof value === 'string') {
      entries.set(path, value);
    } else if (typeof value === 'object' && value !== null) {
      flatten(value as Messages, path).forEach((text, nested) => entries.set(nested, text));
    }
  }
  return entries;
}

function placeholders(text: string): string[] {
  return [...text.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1] ?? '').sort();
}

describe('translations', () => {
  const english = flatten(messages.en);
  const bosnian = flatten(messages.bs);

  it('has exactly the same keys in Bosnian and English', () => {
    expect([...bosnian.keys()].sort()).toEqual([...english.keys()].sort());
    expect(english.size).toBeGreaterThan(40);
  });

  it('uses the same placeholders in both languages and leaves nothing empty', () => {
    for (const [key, text] of english) {
      const translated = bosnian.get(key) ?? '';
      expect(translated.trim(), key).not.toBe('');
      expect(placeholders(translated), key).toEqual(placeholders(text));
    }
  });
});

describe('mergeMessages', () => {
  it('merges the files of one language and ignores the other', () => {
    const merged = mergeMessages(
      {
        './locales/en/a.json': { a: { hello: 'Hello' } },
        './locales/en/b.json': { b: { bye: 'Bye' } },
        './locales/bs/a.json': { a: { hello: 'Zdravo' } },
      },
      'en',
    );
    expect(merged).toEqual({ a: { hello: 'Hello' }, b: { bye: 'Bye' } });
  });

  it('refuses two files that define the same top-level key', () => {
    expect(() =>
      mergeMessages(
        { './locales/en/a.json': { shared: {} }, './locales/en/b.json': { shared: {} } },
        'en',
      ),
    ).toThrow(/defined twice/);
  });
});

describe('detectLanguage', () => {
  it('prefers a saved, supported choice', () => {
    expect(detectLanguage('en', 'bs-BA')).toBe('en');
    expect(detectLanguage('bs', 'en-GB')).toBe('bs');
  });

  it('falls back to the browser language, defaulting to Bosnian', () => {
    expect(detectLanguage(null, 'en-US')).toBe('en');
    expect(detectLanguage(null, 'hr-HR')).toBe('bs');
    expect(detectLanguage('de', 'de-DE')).toBe('bs');
  });
});
