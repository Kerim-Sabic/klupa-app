import { describe, expect, it } from 'vitest';
import bs from '../i18n/locales/bs/ui.json';
import en from '../i18n/locales/en/ui.json';

type Tree = { readonly [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ''): Map<string, string> {
  const entries = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix === '' ? key : `${prefix}.${key}`;
    if (typeof value === 'string') entries.set(path, value);
    else flatten(value, path).forEach((text, nested) => entries.set(nested, text));
  }
  return entries;
}

function placeholders(text: string): string[] {
  return [...text.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1] ?? '').sort();
}

describe('ui.json', () => {
  it('owns exactly one top-level key, "ui", in both languages', () => {
    expect(Object.keys(en)).toEqual(['ui']);
    expect(Object.keys(bs)).toEqual(['ui']);
  });

  it('has the same keys in Bosnian and English', () => {
    expect([...flatten(bs).keys()].sort()).toEqual([...flatten(en).keys()].sort());
  });

  it('leaves nothing empty and keeps placeholders identical', () => {
    const bosnian = flatten(bs);
    for (const [key, text] of flatten(en)) {
      const translated = bosnian.get(key) ?? '';
      expect(text.trim(), key).not.toBe('');
      expect(translated.trim(), key).not.toBe('');
      expect(placeholders(translated), key).toEqual(placeholders(text));
    }
  });
});
