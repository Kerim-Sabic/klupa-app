import { ClipboardList, ListPlus, Radio } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { EvidenceEvent } from '../../engine';
import { Card, EmptyState, LinkButton, PageHeader, Segmented, Stage } from '../../ui';
import { formatDate } from '../../lib/dates';
import type { FeedState } from './api';
import { formatClock, formatXg } from './chartModel';
import { FocusCard } from './FocusCard';
import { LiveCentre } from './LiveCentre';
import { MomentumExplorer } from './MomentumExplorer';
import { OriginsCard } from './OriginsCard';
import {
  evidenceOf,
  reviewPeriods,
  scoreOf,
  shotMarks,
  type ReviewEvent,
  type ReviewMatch,
} from './reviewModel';
import { ShotMap } from './ShotMap';

function ReviewSection({
  id,
  title,
  intro,
  children,
}: {
  readonly id: string;
  readonly title: string;
  readonly intro?: string;
  readonly children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <div>
        <h2 id={id} className="font-display text-[30px] text-ink">
          {title}
        </h2>
        {intro !== undefined && <p className="mt-1 max-w-prose text-ink-soft">{intro}</p>}
      </div>
      {children}
    </section>
  );
}

function ScoreCard({
  teamName,
  opponent,
  score,
}: {
  readonly teamName: string;
  readonly opponent: string;
  readonly score: Readonly<Record<'home' | 'away', number>>;
}) {
  const { t } = useTranslation();
  return (
    <Stage className="flex items-center justify-center gap-4 px-4 py-5 tabular-nums sm:gap-8 sm:py-7">
      <p className="sr-only">
        {t('review.scoreText', {
          home: teamName,
          away: opponent,
          homeGoals: score.home,
          awayGoals: score.away,
        })}
      </p>
      <span
        aria-hidden="true"
        className="min-w-0 flex-1 text-right text-[15px] leading-tight font-semibold text-balance text-home sm:text-headline"
      >
        {teamName}
      </span>
      <span
        aria-hidden="true"
        className="font-score text-[60px] whitespace-nowrap text-ink sm:text-[84px]"
      >
        {`${String(score.home)} : ${String(score.away)}`}
      </span>
      <span
        aria-hidden="true"
        className="min-w-0 flex-1 text-[15px] leading-tight font-semibold text-balance text-away sm:text-headline"
      >
        {opponent}
      </span>
    </Stage>
  );
}

interface ReviewBodyProps {
  readonly match: ReviewMatch;
  readonly events: readonly ReviewEvent[];
  readonly teamName: string;
  /** The state of the live feed while the match is open; null or absent when it is not followed. */
  readonly feed?: FeedState | null;
}

/** The loaded review: header and score, then the three questions a coach asks after a match. */
export function ReviewBody({ match, events, teamName, feed = null }: ReviewBodyProps) {
  const { t, i18n } = useTranslation();
  const [periodValue, setPeriodValue] = useState('1');
  const sideNames = { home: teamName, away: match.opponent };
  const periods = useMemo(() => reviewPeriods(match, events), [match, events]);
  const evidence = useMemo(() => evidenceOf(events), [events]);
  const byId = useMemo(() => new Map(events.map((event) => [event.id, event])), [events]);
  const period =
    periods.find((candidate) => String(candidate.period) === periodValue) ?? periods[0];
  const score = scoreOf(events);
  const live = match.status !== 'finished';
  const taggerLink = `/matches/${encodeURIComponent(match.id)}/live`;

  const describeEvent = (event: EvidenceEvent): string => {
    const row = byId.get(event.id);
    return t('review.evidenceItem', {
      time: formatClock(event.t),
      actor: sideNames[row?.side ?? event.side],
      kind: row === undefined ? '' : t(`review.kind.${row.kind}`),
      value: formatXg(event.weight, i18n.language),
    });
  };

  return (
    <article className="flex flex-col gap-10">
      <div>
        <PageHeader
          title={t('review.title', { opponent: match.opponent })}
          subtitle={t('review.subtitle', {
            date: formatDate(match.played_on, i18n.language, 'long'),
            status: t(`review.status.${match.status}`),
          })}
          back={{ to: '/matches', label: t('review.back') }}
          actions={
            <>
              {live && (
                <LinkButton to={taggerLink} icon={<Radio />}>
                  {t('review.openTagger')}
                </LinkButton>
              )}
              <LinkButton
                to={`/training/new?match=${encodeURIComponent(match.id)}`}
                variant={live ? 'secondary' : 'primary'}
                icon={<ClipboardList />}
              >
                {t('review.planTraining')}
              </LinkButton>
            </>
          }
        />
        {match.status === 'live' ? (
          <LiveCentre
            events={events}
            sideNames={sideNames}
            periodCount={match.period_count}
            feed={feed}
          />
        ) : (
          <ScoreCard teamName={teamName} opponent={match.opponent} score={score} />
        )}
      </div>

      {events.length === 0 || period === undefined ? (
        <EmptyState
          icon={<ListPlus />}
          title={t('review.empty.title')}
          body={t('review.empty.body')}
          {...(live && {
            action: <LinkButton to={taggerLink}>{t('review.openTagger')}</LinkButton>,
          })}
        />
      ) : (
        <>
          <ReviewSection
            id="review-top"
            title={t('review.top.title')}
            intro={t('review.top.intro')}
          >
            <MomentumExplorer
              events={evidence}
              marks={shotMarks(events, period.period)}
              period={period.period}
              durationSeconds={period.durationSeconds}
              sideNames={sideNames}
              resetKey={`${match.id}:${String(period.period)}`}
              describeEvent={describeEvent}
              controls={
                periods.length > 1 ? (
                  <Segmented
                    label={t('review.top.period')}
                    value={String(period.period)}
                    onChange={setPeriodValue}
                    options={periods.map((candidate) => ({
                      value: String(candidate.period),
                      label: t(
                        periods.length === 2 ? 'lab.periodOption' : 'review.top.periodOption',
                        {
                          number: candidate.period,
                        },
                      ),
                    }))}
                  />
                ) : undefined
              }
            />
          </ReviewSection>

          <ReviewSection id="review-shots" title={t('review.shots.title')}>
            <Card>
              <ShotMap events={events} sideNames={sideNames} />
            </Card>
          </ReviewSection>

          <ReviewSection
            id="review-origins"
            title={t('review.origins.title')}
            intro={t('review.origins.intro')}
          >
            <OriginsCard events={events} sideNames={sideNames} />
          </ReviewSection>

          <ReviewSection id="review-focus" title={t('review.focus.title')}>
            <FocusCard events={events} matchId={match.id} />
          </ReviewSection>
        </>
      )}
    </article>
  );
}
