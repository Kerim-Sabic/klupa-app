import { useTranslation } from 'react-i18next';
import { LiveCentre } from '../../features/momentum/LiveCentre';
import { Card } from '../../ui';
import { SAMPLE_EVENTS } from './sampleMatch';

/**
 * What a match day looks like, shown with the product itself: the real live match centre,
 * fed a made-up half. It is there to be looked at, so it cannot be focused or tapped and a
 * screen reader gets one sentence instead of a second, fake match.
 */
export default function MatchDay() {
  const { t } = useTranslation();
  const sideNames = { home: t('landing.matchday.home'), away: t('landing.matchday.away') };
  return (
    <Card
      as="section"
      padded={false}
      aria-labelledby="landing-matchday"
      className="grid items-center gap-10 px-6 py-10 sm:px-10 sm:py-14 lg:grid-cols-2 lg:gap-14"
    >
      <div className="max-lg:text-center">
        <h2
          id="landing-matchday"
          className="font-title text-[32px] leading-[1.06] tracking-[-0.03em] text-balance sm:text-[48px]"
        >
          {t('landing.matchday.title')}
        </h2>
        <p className="mt-4 text-[17px] text-pretty text-ink-soft max-lg:mx-auto max-lg:max-w-xl sm:text-[20px]">
          {t('landing.matchday.body')}
        </p>
      </div>
      <div className="mx-auto w-full max-w-[23rem]">
        <p className="sr-only">{t('landing.matchday.label')}</p>
        <div
          aria-hidden="true"
          inert
          className="max-h-[38rem] overflow-hidden rounded-[2.25rem] bg-paper p-3 ring-1 ring-hairline select-none"
        >
          <LiveCentre events={SAMPLE_EVENTS} sideNames={sideNames} periodCount={2} feed="live" />
        </div>
      </div>
    </Card>
  );
}
