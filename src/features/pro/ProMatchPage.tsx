import { SearchX } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { PublicLayout } from '../../app/PublicLayout';
import { EmptyState, ErrorNotice, LinkButton, PageHeader, Skeleton } from '../../ui';
import { useProIndex, useProMatch } from './data';
import { ProMatchBody } from './ProMatchBody';

function MatchSkeleton() {
  const { t } = useTranslation();
  return (
    <div role="status" className="flex flex-col gap-4">
      <span className="sr-only">{t('pro.match.loading')}</span>
      <Skeleton className="h-11 w-2/3" />
      <Skeleton className="h-48 w-full rounded-card" />
      <Skeleton className="h-24 w-full rounded-card" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-80 w-full rounded-card" />
        <Skeleton className="h-80 w-full rounded-card" />
      </div>
    </div>
  );
}

/** Route `/pro/:matchId`: the id is checked against the list before anything else is fetched. */
export function ProMatchPage() {
  const { t } = useTranslation();
  const raw = useParams().matchId ?? '';
  const id = /^\d{1,10}$/.test(raw) ? Number(raw) : -1;
  const index = useProIndex();
  const listed = index.data?.matches.some((match) => match.id === id) === true;
  const match = useProMatch(id, listed);
  const unknown = index.isSuccess && !listed;
  const failed = index.isError || match.isError;

  return (
    <PublicLayout wide>
      {unknown && (
        <>
          <PageHeader
            title={t('pro.match.notFound.title')}
            back={{ to: '/pro', label: t('pro.match.back') }}
          />
          <EmptyState
            icon={<SearchX />}
            title={t('pro.match.notFound.body')}
            action={<LinkButton to="/pro">{t('pro.match.notFound.action')}</LinkButton>}
          />
        </>
      )}
      {failed && (
        <>
          <PageHeader
            title={t('pro.match.error.heading')}
            back={{ to: '/pro', label: t('pro.match.back') }}
          />
          <ErrorNotice
            title={t('pro.match.error.title')}
            body={t('pro.match.error.body')}
            onRetry={() => {
              if (index.isError) void index.refetch();
              else void match.refetch();
            }}
          />
        </>
      )}
      {!unknown && !failed && (index.data === undefined || match.data === undefined) && (
        <MatchSkeleton />
      )}
      {index.data !== undefined && match.data !== undefined && (
        <ProMatchBody key={match.data.id} match={match.data} index={index.data} />
      )}
    </PublicLayout>
  );
}
