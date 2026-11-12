import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

export const SUPPORTED_LANGUAGES = ['bs', 'en'] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];
export type Messages = Record<string, unknown>;

const STORAGE_KEY = 'klupa.language';

// Each feature owns one file per language under locales/<language>/.
const files = import.meta.glob<Messages>('./locales/*/*.json', { eager: true, import: 'default' });

/**
 * Merge every feature's messages for one language. A file owns its top-level
 * keys, so two features can never silently overwrite each other's text.
 */
export function mergeMessages(modules: Record<string, Messages>, language: Language): Messages {
  const merged: Messages = {};
  const paths = Object.keys(modules).sort();
  for (const path of paths) {
    if (!path.includes(`/locales/${language}/`)) continue;
    for (const [key, value] of Object.entries(modules[path] ?? {})) {
      if (key in merged) {
        throw new Error(`Translation key "${key}" is defined twice for "${language}" (${path}).`);
      }
      merged[key] = value;
    }
  }
  return merged;
}

export const messages: Readonly<Record<Language, Messages>> = {
  bs: mergeMessages(files, 'bs'),
  en: mergeMessages(files, 'en'),
};

function isLanguage(value: string | null): value is Language {
  return SUPPORTED_LANGUAGES.some((language) => language === value);
}

/** Saved choice first, then the browser's language, then Bosnian (the home market). */
export function detectLanguage(saved: string | null, browser: string): Language {
  if (isLanguage(saved)) return saved;
  return browser.toLowerCase().startsWith('en') ? 'en' : 'bs';
}

function readSaved(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null; // Storage can be blocked; the app must still start.
  }
}

void i18n.use(initReactI18next).init({
  resources: { bs: { translation: messages.bs }, en: { translation: messages.en } },
  lng: detectLanguage(readSaved(), window.navigator.language),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

function applyLanguage(language: string): void {
  document.documentElement.lang = language;
  try {
    window.localStorage.setItem(STORAGE_KEY, language);
  } catch {
    // Not being able to remember the choice is not an error worth surfacing.
  }
}

applyLanguage(i18n.language);
i18n.on('languageChanged', applyLanguage);

export default i18n;
