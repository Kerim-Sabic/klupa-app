import { useTranslation } from 'react-i18next';
import { StateBadge } from '../../ui';

/*
 * One made-up quarter of an hour, read three ways. The 10-minute line stays above the middle
 * (we are on top), the 3-minute line dips below it for a while (they are): that stretch is
 * the one the verdict is about.
 */
const WINDOW_10 = 'M0 44 L40 42 L80 40 L120 38 L160 36 L200 37 L240 35 L280 33 L320 32';
const WINDOW_5 = 'M0 46 L40 40 L80 44 L120 48 L160 52 L200 46 L240 38 L280 34 L320 30';
const WINDOW_3 = 'M0 48 L40 36 L80 50 L120 66 L160 72 L200 60 L240 42 L280 32 L320 26';
const DISAGREE = { from: 104, to: 222 } as const;

/**
 * The idea of the review screen as one small figure, for the landing page. It is a picture of
 * the product, so screen readers get one sentence.
 */
export function ReadingGraphic() {
  const { t } = useTranslation();
  return (
    <div role="img" aria-label={t('landing.tiles.reading.label')}>
      <div aria-hidden="true">
        <svg viewBox="0 0 320 100" fill="none" className="reveal-x block w-full">
          <rect
            x={DISAGREE.from}
            y="6"
            width={DISAGREE.to - DISAGREE.from}
            height="88"
            rx="8"
            className="fill-clay-soft"
          />
          <path d="M0 56H320" className="stroke-line" strokeWidth="1" />
          <path d={WINDOW_10} className="stroke-ink/30" strokeWidth="2" strokeLinejoin="round" />
          <path d={WINDOW_5} className="stroke-ink/55" strokeWidth="2" strokeLinejoin="round" />
          <path d={WINDOW_3} className="stroke-ink" strokeWidth="2.5" strokeLinejoin="round" />
        </svg>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 text-footnote text-ink-soft">
          <span className="flex gap-4 whitespace-nowrap">
            <span className="font-semibold text-ink">{t('landing.tiles.reading.w3')}</span>
            <span>{t('landing.tiles.reading.w5')}</span>
            <span>{t('landing.tiles.reading.w10')}</span>
          </span>
          <StateBadge state="window-sensitive" size="sm" />
        </div>
      </div>
    </div>
  );
}
