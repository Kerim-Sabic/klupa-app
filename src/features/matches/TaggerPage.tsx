import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SearchX } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { useActiveClub } from '../../lib/club';
import { queryKeys, type MatchSummary } from '../../lib/data';
import { EmptyState, ErrorNotice, LinkButton, PageHeader, Skeleton } from '../../ui';
import { fetchEvents, fetchMatch, fetchStints } from './api';
import { Tagger } from './Tagger';

/** `/matches/:matchId/live`: loads the match, its events and its stints, then hands over. */
export function TaggerPage() {
  const { t } = useTranslation();
  const { matchId = '' } = useParams();
  const { clubId, teamId } = useActiveClub();
  const client = useQueryClient();

  const match = useQuery({
    queryKey: queryKeys.match(matchId),
    queryFn: () => fetchMatch(clubId, matchId),
    // Coming from the list, the match is already known: show the tagger without a wait.
    initialData: () =>
      client
        .getQueryData<MatchSummary[]>(queryKeys.matches(teamId))
        ?.find((entry) => entry.id === matchId),
    initialDataUpdatedAt: () => client.getQueryState(queryKeys.matches(teamId))?.dataUpdatedAt,
  });
  const events = useQuery({
    queryKey: queryKeys.matchEvents(matchId),
    queryFn: () => fetchEvents(clubId, matchId),
  });
  const stints = useQuery({
    queryKey: queryKeys.stints(matchId),
    queryFn: () => fetchStints(clubId, matchId),
  });

  const header = (
    <PageHeader
      title={t('matches.title')}
      back={{ to: '/matches', label: t('matches.tagger.back') }}
    />
  );

  if (match.isError || events.isError || stints.isError) {
    return (
      <>
        {header}
        <ErrorNotice
          title={t('matches.tagger.loadError')}
          onRetry={() => {
            void match.refetch();
            void events.refetch();
            void stints.refetch();
          }}
        />
      </>
    );
  }

  if (match.isPending || events.isPending || stints.isPending) {
    return (
      <>
        {header}
        <div role="status" aria-label={t('matches.tagger.loading')} className="flex flex-col gap-4">
          <Skeleton className="h-40 w-full rounded-card" />
          <Skeleton className="h-48 w-full rounded-card" />
          <Skeleton className="h-72 w-full rounded-card" />
        </div>
      </>
    );
  }

  if (match.data === null) {
    return (
      <>
        {header}
        <EmptyState
          icon={<SearchX />}
          title={t('matches.tagger.notFound')}
          action={<LinkButton to="/matches">{t('matches.tagger.back')}</LinkButton>}
        />
      </>
    );
  }

  return <Tagger match={match.data} events={events.data} stints={stints.data} />;
}
