import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, RingStack, Stage, type RingDatum } from '../../ui';
import { formatPercent as formatShare } from '../../features/momentum/chartModel';
import { headline } from '../../features/momentum/researchModel';
import { formatCount } from '../home/format';
import { ReadingGraphic } from './ReadingGraphic';
import { TextLink } from './TextLink';

/** The 2018 final, the match the professional screens are demonstrated on. */
const FINAL_PATH = '/pro/2058017';
const FINAL_SCORE = { home: 4, away: 2 } as const;

/** Example values for the rings: a season in which most, not all, children are being seen. */
const EXAMPLE_RINGS = [
  { id: 'fair', value: 0.86 },
  { id: 'observed', value: 0.79 },
  { id: 'effort', value: 0.93 },
] as const;
const RING_TONE = { fair: 'fair', observed: 'seen', effort: 'effort' } as const;

function Words({
  id,
  title,
  body,
  children,
}: {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly children?: ReactNode;
}) {
  return (
    <div className="text-center">
      <h2
        id={id}
        className="font-title text-[28px] leading-[1.08] tracking-[-0.028em] text-balance sm:text-[36px]"
      >
        {title}
      </h2>
      <p className="mx-auto mt-3 max-w-md text-[17px] text-pretty text-ink-soft">{body}</p>
      {children}
    </div>
  );
}

const TILE = 'flex min-w-0 flex-col gap-8 px-6 py-10 sm:px-10 sm:py-12';

/** What Klupa does, a tile at a time: each says one thing and shows it. */
export function Tiles() {
  const { t, i18n } = useTranslation();
  const rings: RingDatum[] = EXAMPLE_RINGS.map((ring) => ({
    id: ring.id,
    label: t(`home.rings.${ring.id}.label`),
    value: ring.value,
    valueText: formatShare(ring.value, i18n.language),
    tone: RING_TONE[ring.id],
  }));

  const research = headline();
  const opposed = formatShare(research.opposedShare, i18n.language, 1);

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <Card as="section" padded={false} aria-labelledby="tile-reading" className={TILE}>
        <Words
          id="tile-reading"
          title={t('landing.tiles.reading.title')}
          body={t('landing.tiles.reading.body')}
        />
        <div className="mx-auto mt-auto w-full max-w-md">
          <ReadingGraphic />
        </div>
      </Card>

      <Card as="section" padded={false} aria-labelledby="tile-fair" className={TILE}>
        <Words
          id="tile-fair"
          title={t('landing.tiles.fair.title')}
          body={t('landing.tiles.fair.body')}
        />
        <div className="mx-auto mt-auto w-full max-w-sm">
          <RingStack title={t('landing.tiles.fair.label')} size={132} rings={rings} />
        </div>
      </Card>

      <Stage as="section" aria-labelledby="tile-final" className={`${TILE} lg:col-span-2`}>
        <Words
          id="tile-final"
          title={t('landing.tiles.final.title')}
          body={t('landing.tiles.final.body')}
        >
          <p className="mt-2">
            <TextLink to={FINAL_PATH}>{t('landing.tiles.final.link')}</TextLink>
          </p>
        </Words>
        <div className="text-center">
          <p className="sr-only">{t('landing.tiles.final.score')}</p>
          <div
            aria-hidden="true"
            className="flex items-center justify-center gap-3 tabular-nums sm:gap-10"
          >
            <span className="min-w-0 flex-1 text-right text-[16px] font-semibold text-home sm:text-[28px]">
              {t('landing.tiles.final.home')}
            </span>
            <span className="font-score text-[68px] whitespace-nowrap sm:text-[168px]">
              {`${String(FINAL_SCORE.home)} : ${String(FINAL_SCORE.away)}`}
            </span>
            <span className="min-w-0 flex-1 text-left text-[16px] font-semibold text-away sm:text-[28px]">
              {t('landing.tiles.final.away')}
            </span>
          </div>
          <p className="mt-2 text-footnote text-ink-soft">{t('landing.tiles.final.meta')}</p>
        </div>
      </Stage>

      <Card as="section" padded={false} aria-labelledby="tile-shot" className={TILE}>
        <Words
          id="tile-shot"
          title={t('landing.tiles.shot.title')}
          body={t('landing.tiles.shot.body')}
        >
          <p className="mt-2">
            <TextLink to="/shot">{t('landing.tiles.shot.link')}</TextLink>
          </p>
          <p>
            <TextLink to="/overlay">{t('landing.tiles.shot.overlay')}</TextLink>
          </p>
        </Words>
        <div className="mt-auto text-center">
          <p className="font-score text-[72px] tabular-nums sm:text-[96px]">0</p>
          <p className="mx-auto mt-2 max-w-xs text-footnote text-pretty text-ink-soft">
            {t('landing.tiles.shot.figure')}
          </p>
        </div>
      </Card>

      <Card as="section" padded={false} aria-labelledby="tile-research" className={TILE}>
        <Words
          id="tile-research"
          title={t('landing.tiles.research.title')}
          body={t('landing.tiles.research.body')}
        >
          <p className="mt-2">
            <TextLink to="/evidence">{t('auth.evidenceLink')}</TextLink>
          </p>
        </Words>
        <div className="mt-auto text-center">
          <p className="font-score text-[72px] text-clay tabular-nums sm:text-[96px]">{opposed}</p>
          <p className="mx-auto mt-2 max-w-xs text-footnote text-pretty text-ink-soft">
            {t('landing.tiles.research.figure', {
              share: opposed,
              matches: formatCount(research.matches, i18n.language),
            })}
          </p>
        </div>
      </Card>
    </div>
  );
}
