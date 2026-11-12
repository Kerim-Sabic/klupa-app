import { useQuery } from '@tanstack/react-query';
import { SearchX } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { useActiveClub } from '../../lib/club';
import { queryKeys } from '../../lib/data';
import { env } from '../../lib/env';
import { errorKey } from '../../lib/errors';
import { isEnabled } from '../../lib/flags';
import { EmptyState, ErrorNotice, LinkButton, PageHeader, Skeleton, SkeletonText } from '../../ui';
import { fetchReviewEvents, fetchReviewMatch } from './api';
import { LiveBanner } from './LiveBanner';
import { ReviewBody } from './ReviewBody';
import { useLiveMatch } from './useLiveMatch';

/**
 * Review of one recorded match: who was on top and how far that can be trusted, where the
 * chances came from, and what the counts suggest working on.
 */
export function MatchReviewPage() {
  const { t } = useTranslation();
  const { matchId = '' } = useParams();
  const { clubId, teamName } = useActiveClub();
  // Own sub-keys under the shared prefixes: a write that invalidates the match refreshes this too.
  const match = useQuery({
    queryKey: [...queryKeys.match(matchId), 'review'],
    queryFn: () => fetchReviewMatch(clubId, matchId),
    enabled: matchId !== '',
  });
  const events = useQuery({
    queryKey: [...queryKeys.matchEvents(matchId), 'review'],
    queryFn: () => fetchReviewEvents(clubId, matchId),
    enabled: matchId !== '',
  });
  // A match that is not over may be being recorded on another phone: follow it.
  const status = match.data?.status;
  const open = status === 'scheduled' || status === 'live';
  const feed = useLiveMatch(matchId, open && isEnabled('liveFeed', env.disabled));
  const back = { to: '/matches', label: t('review.back') };

  if (match.isError || events.isError) {
    return (
      <>
        <PageHeader title={t('review.pageTitle')} back={back} />
        <ErrorNotice
          title={t('review.loadFailed')}
          body={t(errorKey(match.error ?? events.error))}
          onRetry={() => {
            void match.refetch();
            void events.refetch();
          }}
        />
      </>
    );
  }

  if (matchId === '' || match.data === null) {
    return (
      <>
        <PageHeader title={t('review.pageTitle')} back={back} />
        <EmptyState
          icon={<SearchX />}
          title={t('review.notFound.title')}
          body={t('review.notFound.body')}
          action={<LinkButton to="/matches">{t('review.back')}</LinkButton>}
        />
      </>
    );
  }

  if (match.data === undefined || events.data === undefined) {
    return (
      <div role="status" aria-busy="true">
        <span className="sr-only">{t('review.loading')}</span>
        <PageHeader title={t('review.pageTitle')} back={back} />
        <div className="flex flex-col gap-4">
          <Skeleton className="h-16 w-48" />
          <Skeleton className="h-64 w-full rounded-card" />
          <SkeletonText lines={4} />
        </div>
      </div>
    );
  }

  return (
    <>
      {/* A live match shows the feed's state inside its match centre instead. */}
      {feed !== null && match.data.status !== 'live' && <LiveBanner state={feed} />}
      <ReviewBody match={match.data} events={events.data} teamName={teamName} feed={feed} />
    </>
  );
}
