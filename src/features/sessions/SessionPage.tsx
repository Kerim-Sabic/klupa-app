import { Printer } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { usePlayers, type Player } from '../../lib/data';
import {
  Button,
  Card,
  EmptyState,
  ErrorNotice,
  LinkButton,
  PageHeader,
  Sheet,
  Skeleton,
  SkeletonText,
} from '../../ui';
import type { SessionDetail } from './api';
import { AttendanceSection } from './AttendanceSection';
import { isUuid } from './constraints';
import { formatDay } from './format';
import { useSessionDetail, useSetSessionStatus } from './hooks';
import { PrintStyles } from './PrintStyles';
import { SessionCard } from './SessionCard';

function NotFound() {
  const { t } = useTranslation();
  return (
    <>
      <PageHeader
        title={t('sessions.notFound.title')}
        back={{ to: '/training', label: t('sessions.back') }}
      />
      <EmptyState
        title={t('sessions.notFound.title')}
        body={t('sessions.notFound.body')}
        action={<LinkButton to="/training">{t('sessions.notFound.action')}</LinkButton>}
      />
    </>
  );
}

/** `/training/:sessionId`. An id that is not a UUID can never exist, so it is never requested. */
export function SessionPage() {
  const { sessionId } = useParams();
  return isUuid(sessionId) ? <SessionLoader sessionId={sessionId} /> : <NotFound />;
}

function SessionLoader({ sessionId }: { readonly sessionId: string }) {
  const { t } = useTranslation();
  const detail = useSessionDetail(sessionId);
  const players = usePlayers();

  if (detail.isPending || players.isPending) {
    return (
      <div role="status" aria-label={t('ui.loading')} className="flex flex-col gap-4">
        <Skeleton className="h-10 w-2/3" />
        <Card>
          <SkeletonText lines={5} />
        </Card>
      </div>
    );
  }
  if (detail.isError || players.isError) {
    return (
      <>
        <PageHeader
          title={t('sessions.title')}
          back={{ to: '/training', label: t('sessions.back') }}
        />
        <ErrorNotice
          title={t('errors.loadFailed')}
          onRetry={() => {
            void detail.refetch();
            void players.refetch();
          }}
        />
      </>
    );
  }
  if (detail.data === null) return <NotFound />;
  return <SessionView detail={detail.data} squad={players.data} />;
}

function SessionView({
  detail,
  squad,
}: {
  readonly detail: SessionDetail;
  readonly squad: readonly Player[];
}) {
  const { t, i18n } = useTranslation();
  const { session, drills } = detail;
  const setStatus = useSetSessionStatus(session.id);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const planned = session.status === 'planned';

  return (
    <>
      <PrintStyles />
      <div className="print:hidden">
        <PageHeader
          title={t(`sessions.focus.${session.focus}`, { defaultValue: session.focus })}
          subtitle={formatDay(session.held_on, i18n.language)}
          back={{ to: '/training', label: t('sessions.back') }}
          actions={
            <Button
              variant="secondary"
              icon={<Printer />}
              onClick={() => {
                window.print();
              }}
            >
              {t('sessions.actions.print')}
            </Button>
          }
        />
      </div>
      <div className="flex flex-col gap-8">
        <SessionCard session={session} drills={drills} />
        {planned && (
          <div className="flex flex-wrap gap-2 print:hidden">
            <Button
              loading={setStatus.isPending}
              onClick={() => {
                setStatus.mutate('completed');
              }}
            >
              {t('sessions.actions.complete')}
            </Button>
            <Button
              variant="secondary"
              disabled={setStatus.isPending}
              onClick={() => {
                setConfirmCancel(true);
              }}
            >
              {t('sessions.actions.cancel')}
            </Button>
          </div>
        )}
        {session.status === 'cancelled' ? (
          <p className="rounded-control border border-dashed border-line px-4 py-3 text-[15px] text-ink-soft print:hidden">
            {t('sessions.cancelledNote')}
          </p>
        ) : (
          <AttendanceSection session={session} squad={squad} />
        )}
      </div>
      <Sheet
        open={confirmCancel}
        onClose={() => {
          setConfirmCancel(false);
        }}
        title={t('sessions.cancelSheet.title')}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setConfirmCancel(false);
              }}
            >
              {t('sessions.cancelSheet.keep')}
            </Button>
            <Button
              variant="danger"
              loading={setStatus.isPending}
              onClick={() => {
                setStatus.mutate('cancelled', {
                  onSettled: () => {
                    setConfirmCancel(false);
                  },
                });
              }}
            >
              {t('sessions.cancelSheet.confirm')}
            </Button>
          </>
        }
      >
        <p className="text-[15px] text-ink-soft">{t('sessions.cancelSheet.body')}</p>
      </Sheet>
    </>
  );
}
