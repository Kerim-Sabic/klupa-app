import { useTranslation } from 'react-i18next';
import { Button } from '../../ui';

/** The first thing a visitor reads: what Klupa is, and one tap into a demo club. */
export function Hero({
  demoBusy,
  onDemo,
}: {
  readonly demoBusy: boolean;
  readonly onDemo: () => void;
}) {
  const { t } = useTranslation();
  return (
    <section className="mx-auto max-w-4xl px-2 pt-6 pb-4 text-center sm:pt-14 sm:pb-8">
      <h1 className="font-title text-[44px] leading-[1.03] tracking-[-0.04em] text-balance sm:text-[72px] lg:text-[88px]">
        {t('landing.title')}
      </h1>
      <p className="mx-auto mt-5 max-w-2xl text-[19px] text-pretty text-ink-soft sm:mt-7 sm:text-[22px] sm:leading-[1.4]">
        {t('landing.lead')}
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
        <Button size="lg" loading={demoBusy} onClick={onDemo}>
          {t('auth.demo')}
        </Button>
        <a
          href="#landing-sign-in"
          className="inline-flex min-h-11 items-center rounded-control text-[17px] font-medium text-pitch underline-offset-4 hover:underline"
        >
          {t('landing.signIn')}
        </a>
      </div>
      <p className="mt-4 text-footnote text-pretty text-ink-soft">{t('auth.demoHint')}</p>
    </section>
  );
}
