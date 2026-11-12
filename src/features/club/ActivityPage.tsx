import { useQuery } from '@tanstack/react-query';
import { History } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useActiveClub } from '../../lib/club';
import { DataTable, EmptyState, PageHeader, Pill, type Column } from '../../ui';
import { listAuditLog, type AuditEntry } from './privacy/api';
import { canManage, clubKeys, formatDateTime } from './model';
import { LoadingBlock, QueryFailed, ReadOnlyNote } from './states';

/** `fieldName` becomes "field name" when there is no translation for it yet. */
function plain(name: string): string {
  return name.replaceAll('_', ' ');
}

/** The newest 100 changes: which table, which fields, when. Never the values themselves. */
export function ActivityPage() {
  const { t, i18n } = useTranslation();
  const { clubId, role } = useActiveClub();
  const allowed = canManage(role);
  const log = useQuery({
    queryKey: clubKeys.audit(clubId),
    queryFn: () => listAuditLog(clubId),
    enabled: allowed,
  });

  const columns = useMemo<Column<AuditEntry>[]>(
    () => [
      {
        id: 'when',
        header: t('club.activity.columns.when'),
        cell: (entry) => formatDateTime(entry.occurred_at, i18n.language),
        sortValue: (entry) => Date.parse(entry.occurred_at),
      },
      {
        id: 'what',
        header: t('club.activity.columns.what'),
        cell: (entry) => <Pill tone="mute">{t(`club.activity.actions.${entry.action}`)}</Pill>,
        sortValue: (entry) => entry.action,
      },
      {
        id: 'where',
        header: t('club.activity.columns.where'),
        cell: (entry) =>
          t(`club.activity.tables.${entry.table_name}`, { defaultValue: plain(entry.table_name) }),
        sortValue: (entry) => entry.table_name,
      },
      {
        id: 'fields',
        header: t('club.activity.columns.fields'),
        cell: (entry) =>
          entry.changed_columns === null || entry.changed_columns.length === 0
            ? t('club.activity.wholeRecord')
            : entry.changed_columns
                .map((column) =>
                  t(`club.activity.fields.${column}`, { defaultValue: plain(column) }),
                )
                .join(', '),
      },
    ],
    [t, i18n.language],
  );

  let body: ReactNode;
  if (!allowed) {
    body = <ReadOnlyNote>{t('club.activity.restricted')}</ReadOnlyNote>;
  } else if (log.isPending) {
    body = <LoadingBlock rows={4} />;
  } else if (log.isError) {
    body = (
      <QueryFailed
        error={log.error}
        onRetry={() => {
          void log.refetch();
        }}
      />
    );
  } else if (log.data.length === 0) {
    body = (
      <EmptyState
        icon={<History />}
        title={t('club.activity.empty.title')}
        body={t('club.activity.empty.body')}
      />
    );
  } else {
    body = (
      <DataTable
        caption={t('club.activity.caption')}
        columns={columns}
        rows={log.data}
        getRowId={(entry) => String(entry.id)}
        initialSort={{ columnId: 'when', direction: 'desc' }}
      />
    );
  }

  return (
    <>
      <PageHeader
        title={t('club.activity.title')}
        subtitle={t('club.activity.subtitle')}
        back={{ to: '/club', label: t('club.back') }}
      />
      <div className="flex flex-col gap-4">
        {allowed && <p className="text-[15px] text-ink-soft">{t('club.activity.note')}</p>}
        {body}
      </div>
    </>
  );
}
