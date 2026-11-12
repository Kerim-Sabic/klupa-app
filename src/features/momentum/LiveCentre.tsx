import { useId, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Side } from '../../engine';
import { Card, StateBadge, Stage } from '../../ui';
import type { FeedState } from './api';
import { formatClock, formatCount, formatXg } from './chartModel';
import {
  LIVE_MEASURES,
  liveSnapshot,
  nowVerdict,
  type LiveMeasure,
  type LiveSnapshot,
} from './liveModel';
import type { ReviewEvent } from './reviewModel';

type SideNames = Readonly<Record<Side, string>>;

const DOT: Record<Side, string> = { home: 'bg-home', away: 'bg-away' };

/** The live mark: a dot that pulses only while changes are arriving, and never under reduced motion. */
function LiveMark({ feed }: { readonly feed: FeedState | null }) {
  const { t } = useTranslation();
  const flowing = feed === 'live';
  return (
    <p className="inline-flex items-center gap-2 rounded-full bg-pitch-soft px-2.5 py-1 text-footnote font-semibold">
      <span aria-hidden="true" className="relative flex size-2.5 shrink-0">
        {flowing && (
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-pitch opacity-60 motion-reduce:animate-none" />
        )}
        <span
          className={`relative inline-flex size-2.5 rounded-full ${flowing ? 'bg-pitch' : 'border border-pitch'}`}
        />
      </span>
      {t(`review.centre.badge.${feed ?? 'open'}`)}
    </p>
  );
}

function Scoreboard({
  snapshot,
  sideNames,
  periodCount,
  feed,
}: {
  readonly snapshot: LiveSnapshot;
  readonly sideNames: SideNames;
  readonly periodCount: number;
  readonly feed: FeedState | null;
}) {
  const { t } = useTranslation();
  const { home, away } = snapshot.numbers;
  const period = t(periodCount === 2 ? 'review.centre.half' : 'review.centre.part', {
    number: snapshot.period,
  });
  return (
    <Stage className="p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <LiveMark feed={feed} />
        <p className="text-footnote text-ink-soft tabular-nums">
          {snapshot.clockSeconds === null
            ? t('review.centre.noEvents')
            : t('review.centre.asOf', { period, clock: formatClock(snapshot.clockSeconds) })}
        </p>
      </div>
      {/* Read out again whenever the score changes, on whichever phone is watching. */}
      <p className="sr-only" aria-live="polite">
        {t('review.scoreText', {
          home: sideNames.home,
          away: sideNames.away,
          homeGoals: home.goals,
          awayGoals: away.goals,
        })}
      </p>
      <div aria-hidden="true" className="mt-3 flex items-center justify-center gap-4 tabular-nums">
        <span className="min-w-0 flex-1 text-right text-[15px] leading-tight font-semibold text-balance text-home sm:text-headline">
          {sideNames.home}
        </span>
        <span className="font-score text-[72px] whitespace-nowrap sm:text-[96px]">
          {`${String(home.goals)} : ${String(away.goals)}`}
        </span>
        <span className="min-w-0 flex-1 text-[15px] leading-tight font-semibold text-balance text-away sm:text-headline">
          {sideNames.away}
        </span>
      </div>
    </Stage>
  );
}

function NowCard({
  snapshot,
  sideNames,
}: {
  readonly snapshot: LiveSnapshot;
  readonly sideNames: SideNames;
}) {
  const { t } = useTranslation();
  const titleId = useId();
  const { reading } = snapshot;
  const verdict = nowVerdict(reading);
  const state = reading?.state ?? 'insufficient';
  return (
    <Card as="section" aria-labelledby={titleId} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={titleId} className="text-footnote font-semibold text-ink-soft">
          {t('review.centre.now.title')}
        </h3>
        <StateBadge state={state} size="sm" />
      </div>
      <p className="font-display text-[30px] text-balance text-ink">
        {t(`review.centre.now.${verdict}`, {
          side: reading?.favoured == null ? '' : sideNames[reading.favoured],
        })}
      </p>
      <p className="text-footnote text-ink-soft">{t(`review.centre.now.detail.${state}`)}</p>
    </Card>
  );
}

function NumbersCard({
  snapshot,
  sideNames,
}: {
  readonly snapshot: LiveSnapshot;
  readonly sideNames: SideNames;
}) {
  const { t, i18n } = useTranslation();
  const show = (measure: LiveMeasure, side: Side) => {
    const value = snapshot.numbers[side][measure];
    return measure === 'units' ? formatXg(value, i18n.language) : formatCount(value, i18n.language);
  };
  return (
    <Card>
      <table className="w-full border-collapse tabular-nums">
        <caption className="pb-2 text-left text-footnote font-semibold text-ink-soft">
          {t('review.centre.numbers.title')}
          {/* The names sit over the table, each with half its width: a number column is too
              narrow for "FK Sloga U13". The column headers below carry them for screen readers. */}
          <span aria-hidden="true" className="mt-2 flex justify-between gap-4">
            <span className="min-w-0 truncate text-home">{sideNames.home}</span>
            <span className="min-w-0 truncate text-right text-away">{sideNames.away}</span>
          </span>
        </caption>
        <thead>
          <tr>
            <th scope="col" className="w-16">
              <span className="sr-only">{sideNames.home}</span>
            </th>
            <th scope="col">
              <span className="sr-only">{t('review.centre.numbers.measure')}</span>
            </th>
            <th scope="col" className="w-16">
              <span className="sr-only">{sideNames.away}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {LIVE_MEASURES.map((measure) => {
            const home = snapshot.numbers.home[measure];
            const away = snapshot.numbers.away[measure];
            return (
              <tr key={measure} className="border-t border-hairline">
                <td className="py-2 text-left font-display text-[22px] text-ink">
                  {show(measure, 'home')}
                </td>
                <th scope="row" className="px-3 py-2 text-center font-normal text-ink">
                  {t(`review.centre.numbers.${measure}`)}
                  {/* The split repeats the two numbers beside it, so it is decoration here. */}
                  <span
                    aria-hidden="true"
                    className="mt-1.5 flex h-1.5 gap-0.5 overflow-hidden rounded-full bg-mute-soft"
                  >
                    {home + away > 0 && (
                      <>
                        <span className="bg-home" style={{ flexGrow: home }} />
                        <span className="bg-away" style={{ flexGrow: away }} />
                      </>
                    )}
                  </span>
                </th>
                <td className="py-2 text-right font-display text-[22px] text-ink">
                  {show(measure, 'away')}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

function LatestCard({
  events,
  sideNames,
}: {
  readonly events: readonly ReviewEvent[];
  readonly sideNames: SideNames;
}) {
  const { t } = useTranslation();
  const titleId = useId();
  return (
    <Card as="section" aria-labelledby={titleId}>
      <h3 id={titleId} className="text-footnote font-semibold text-ink-soft">
        {t('review.centre.latest.title')}
      </h3>
      {events.length === 0 ? (
        <p className="mt-2 text-ink-soft">{t('review.centre.latest.empty')}</p>
      ) : (
        <ol className="mt-1 divide-y divide-hairline">
          {events.map((event) => (
            <li key={event.id} className="flex items-center gap-3 py-2">
              <span className="w-12 shrink-0 font-semibold tabular-nums">
                {formatClock(event.clock_seconds)}
              </span>
              <span
                aria-hidden="true"
                className={`size-2 shrink-0 rounded-full ${DOT[event.side]}`}
              />
              <span className="min-w-0">
                <span className="font-semibold text-ink">{t(`review.kind.${event.kind}`)}</span>
                <span className="text-ink-soft">{` · ${sideNames[event.side]}`}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

export interface LiveCentreProps {
  readonly events: readonly ReviewEvent[];
  readonly sideNames: SideNames;
  readonly periodCount: number;
  /** The state of the live feed, or null when this page is not following the match. */
  readonly feed: FeedState | null;
}

/**
 * A match in progress on one screen: the score, who is on top as of the newest event and how
 * far that can be trusted, the counts so far, and the last few events. It redraws by itself as
 * events are recorded on any phone, because the page's queries are refreshed by the live feed.
 */
export function LiveCentre({ events, sideNames, periodCount, feed }: LiveCentreProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const snapshot = useMemo(() => liveSnapshot(events), [events]);
  return (
    <section aria-labelledby={titleId} className="@container flex flex-col gap-3">
      <h2 id={titleId} className="sr-only">
        {t('review.centre.title')}
      </h2>
      <Scoreboard snapshot={snapshot} sideNames={sideNames} periodCount={periodCount} feed={feed} />
      <div className="grid gap-3 @3xl:grid-cols-2">
        <div className="flex flex-col gap-3">
          <NowCard snapshot={snapshot} sideNames={sideNames} />
          <LatestCard events={snapshot.latest} sideNames={sideNames} />
        </div>
        <NumbersCard snapshot={snapshot} sideNames={sideNames} />
      </div>
    </section>
  );
}
