import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES } from '../i18n';

/**
 * Two-language switch, drawn as a small segmented pill. Each button is labelled in its own
 * language and reports its state with `aria-pressed`, so the choice never rests on colour.
 */
export function LanguageSwitch() {
  const { t, i18n } = useTranslation();
  return (
    <div
      role="group"
      aria-label={t('app.language')}
      className="flex shrink-0 gap-0.5 rounded-full bg-mute-soft p-0.5"
    >
      {SUPPORTED_LANGUAGES.map((language) => {
        const active = i18n.language === language;
        return (
          <button
            key={language}
            type="button"
            lang={language}
            aria-pressed={active}
            onClick={() => {
              void i18n.changeLanguage(language);
            }}
            className={`min-h-10 min-w-11 rounded-full px-3 text-footnote font-semibold transition-[background-color,color,box-shadow,transform] duration-150 ease-touch active:scale-[0.96] ${
              active
                ? 'bg-raised text-ink shadow-[0_1px_2px_rgb(18_22_28/0.14)]'
                : 'text-ink-soft hover:text-ink'
            }`}
          >
            {t(`lang.${language}`)}
          </button>
        );
      })}
    </div>
  );
}
