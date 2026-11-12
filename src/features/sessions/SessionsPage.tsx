import { ClipboardList, Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useSessionPages, type SessionSummary } from '../../lib/data';
import {
  Button,
  Card,
  EmptyState,
  ErrorNotice,
  LinkButton,
  PageHeader,
  RevealList,
  Skeleton,
} from '../../ui';
import { formatDay } from './format';
import { StatusPill } from './SessionCard';

function SessionItem({ session }: { readonly session: SessionSummary }) {
  const { t, i18n } = useTranslation();
  const focus = t(`sessions.focus.${session.focus}`, { defaultValue: session.focus });
  return (
    <Card as="li" interactive className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-[17px] leading-snug font-semibold text-ink">
          <Link
            to={`/training/${session.id}`}
            className="after:absolute after:inset-0 after:rounded-card after:content-['']"
          >
            {focus}
          </Link>
        </h2>
        <p className="mt-0.5 text-[15px] text-ink-soft tabular-nums">
          {formatDay(session.held_on, i18n.language)}
          {' · '}
          {t('sessions.planner.minutesShort', { minutes: session.duration_minutes })}
        </p>
      </div>
      <StatusPill status={session.status} />
    </Card>
  );
}

/** `/training`: every session the team has planned, newest first. */
export function SessionsPage() {
  const { t } = useTranslation();
  const sessions = useSessionPages();
  const plan = (
    <LinkButton to="/training/new" icon={<Plus />}>
      {t('sessions.list.plan')}
    </LinkButton>
  );

  let body: ReactNode;
  if (sessions.isPending) {
    body = (
      <div role="status" aria-label={t('ui.loading')} className="flex flex-col gap-3">
        {[0, 1, 2].map((index) => (
          <Skeleton key={index} className="h-20 w-full rounded-card" />
        ))}
      </div>
    );
  } else if (sessions.isError) {
    body = (
      <ErrorNotice
        title={t('errors.loadFailed')}
        onRetry={() => {
          sessions.refetch();
        }}
      />
    );
  } else if (sessions.data.length === 0) {
    body = (
      <EmptyState
        icon={<ClipboardList />}
        title={t('sessions.list.emptyTitle')}
        body={t('sessions.list.emptyBody')}
        action={plan}
      />
    );
  } else {
    body = (
      <>
        <RevealList as="ul" className="flex flex-col gap-3">
          {sessions.data.map((session) => (
            <SessionItem key={session.id} session={session} />
          ))}
        </RevealList>
        {sessions.hasMore && (
          <div className="mt-4">
            <Button variant="secondary" onClick={sessions.loadMore} disabled={sessions.loadingMore}>
              {t('sessions.list.showEarlier')}
            </Button>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={t('sessions.title')}
        subtitle={t('sessions.subtitle')}
        {...(sessions.isSuccess && sessions.data.length > 0 && { actions: plan })}
      />
      {body}
    </>
  );
}
