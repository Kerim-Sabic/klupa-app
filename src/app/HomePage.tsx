import { Activity, ClipboardList } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { localIsoDate } from '../features/insights/transform';
import { useActiveClub } from '../lib/club';
import { formatDate } from '../lib/dates';
import { Card, ErrorNotice, LargeTitle, LinkButton, Skeleton, SkeletonText } from '../ui';
import { MoreSection } from './home/MoreSection';
import { useTodaySource } from './home/useToday';

/*
 * The sections and their arithmetic (the momentum, load, opportunity and resource engines) are
 * downloaded only once a signed-in coach opens Today, so the sign-in screen does not pay for
 * them; the skeleton covers the moment it takes.
 */
const TodayBody = lazy(async () => ({ default: (await import('./home/TodayBody')).TodayBody }));

function TodaySkeleton() {
  const { t } = useTranslation();
  return (
    <div role="status" className="flex flex-col gap-8">
      <span className="sr-only">{t('home.loading')}</span>
      <Card className="flex items-center gap-5">
        <Skeleton className="size-[136px] shrink-0 rounded-full" />
        <div className="flex-1">
          <SkeletonText lines={4} />
        </div>
      </Card>
      <div className="grid gap-3 lg:grid-cols-2">
        <Skeleton className="h-28 w-full rounded-card" />
        <Skeleton className="h-28 w-full rounded-card" />
      </div>
    </div>
  );
}

/** Today: where the team stands, what needs the coach, and how the last match went. */
export function HomePage() {
  const { t, i18n } = useTranslation();
  const club = useActiveClub();
  // Read once per visit: the screen describes the day it was opened on.
  const [now] = useState(() => new Date());
  const source = useTodaySource(localIsoDate(now));

  return (
    <div className="page-settle flex flex-col gap-9">
      <header>
        <LargeTitle
          eyebrow={formatDate(now, i18n.language, 'weekday')}
          title={t('home.title')}
          subtitle={t('home.subtitle', { team: club.teamName, club: club.clubName })}
          actions={
            <>
              <LinkButton to="/matches" icon={<Activity />}>
                {t('home.actions.record')}
              </LinkButton>
              <LinkButton to="/training/new" variant="secondary" icon={<ClipboardList />}>
                {t('home.actions.plan')}
              </LinkButton>
            </>
          }
        />
      </header>
      {source.status === 'loading' && <TodaySkeleton />}
      {source.status === 'error' && (
        <ErrorNotice
          title={t('home.loadFailed')}
          body={t('errors.offline')}
          onRetry={source.retry}
        />
      )}
      {source.status === 'ready' && (
        <Suspense fallback={<TodaySkeleton />}>
          <TodayBody input={source.data} />
        </Suspense>
      )}
      <MoreSection />
    </div>
  );
}
