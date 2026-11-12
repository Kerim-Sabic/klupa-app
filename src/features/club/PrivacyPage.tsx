import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Trash2 } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useActiveClub } from '../../lib/club';
import { errorKey } from '../../lib/errors';
import {
  Button,
  Card,
  CardTitle,
  DataTable,
  PageHeader,
  Pill,
  useToast,
  type Column,
} from '../../ui';
import {
  createDataRequest,
  exportClubData,
  listDataRequests,
  resolveDataRequest,
  type DataRequest,
} from './privacy/api';
import { DeleteClubSheet } from './DeleteClubSheet';
import { downloadJson } from './download';
import { clubKeys, formatDateTime, isOwner, todayIso } from './model';
import { LoadingBlock, QueryFailed, ReadOnlyNote } from './states';
import { useTarget } from './useTarget';

const STORED = ['players', 'quarter', 'consent', 'activity'] as const;
const KEPT = ['events', 'log', 'demo'] as const;
const STATUS_TONE = { open: 'mute', completed: 'pitch', rejected: 'clay' } as const;

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <Card as="section" aria-labelledby={id} className="flex flex-col gap-3">
      <CardTitle>
        <span id={id}>{title}</span>
      </CardTitle>
      {children}
    </Card>
  );
}

function RequestsTable() {
  const { t, i18n } = useTranslation();
  const { clubId } = useActiveClub();
  const requests = useQuery({
    queryKey: clubKeys.requests(clubId),
    queryFn: () => listDataRequests(clubId),
  });
  const columns = useMemo<Column<DataRequest>[]>(
    () => [
      {
        id: 'kind',
        header: t('club.privacy.requests.kind'),
        cell: (request) => t(`club.privacy.requests.kinds.${request.kind}`),
      },
      {
        id: 'date',
        header: t('club.privacy.requests.date'),
        cell: (request) => formatDateTime(request.created_at, i18n.language),
        sortValue: (request) => Date.parse(request.created_at),
      },
      {
        id: 'status',
        header: t('club.privacy.requests.status'),
        cell: (request) => (
          <Pill tone={STATUS_TONE[request.status]}>
            {t(`club.privacy.requests.statuses.${request.status}`)}
          </Pill>
        ),
      },
    ],
    [t, i18n.language],
  );

  if (requests.isPending) return <LoadingBlock rows={2} />;
  if (requests.isError) {
    return (
      <QueryFailed
        error={requests.error}
        onRetry={() => {
          void requests.refetch();
        }}
      />
    );
  }
  return (
    <DataTable
      caption={t('club.privacy.requests.caption')}
      columns={columns}
      rows={requests.data}
      getRowId={(request) => request.id}
      initialSort={{ columnId: 'date', direction: 'desc' }}
      empty={t('club.privacy.requests.empty')}
    />
  );
}

/** What is stored, where, for how long; and the owner's two rights: a copy, and deletion. */
export function PrivacyPage() {
  const { t } = useTranslation();
  const { clubId, role } = useActiveClub();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const owner = isOwner(role);
  const deleting = useTarget<null>();

  // The request is recorded before the file is handed over, so every export leaves a dated trail.
  const exportData = useMutation({
    mutationFn: async () => {
      const data = await exportClubData(clubId);
      const requestId = await createDataRequest(clubId, 'export');
      const now = new Date();
      await resolveDataRequest(clubId, requestId, 'completed', now.toISOString());
      const fileName = `klupa-export-${todayIso(now)}.json`;
      downloadJson(fileName, data);
      return fileName;
    },
    onSuccess: async (fileName) => {
      await queryClient.invalidateQueries({ queryKey: clubKeys.requests(clubId) });
      toast({ tone: 'success', message: t('club.privacy.export.done', { file: fileName }) });
    },
    onError: (error) => {
      toast({ tone: 'error', message: t(errorKey(error)) });
    },
  });

  return (
    <>
      <PageHeader
        title={t('club.privacy.title')}
        subtitle={t('club.privacy.subtitle')}
        back={{ to: '/club', label: t('club.back') }}
      />
      <div className="flex flex-col gap-4">
        <Section id="privacy-stored" title={t('club.privacy.stored.title')}>
          <ul className="list-disc pl-5">
            {STORED.map((item) => (
              <li key={item}>{t(`club.privacy.stored.${item}`)}</li>
            ))}
          </ul>
          <p className="font-semibold">{t('club.privacy.stored.never')}</p>
        </Section>
        <Section id="privacy-where" title={t('club.privacy.where.title')}>
          <p>{t('club.privacy.where.body')}</p>
        </Section>
        <Section id="privacy-kept" title={t('club.privacy.kept.title')}>
          <ul className="list-disc pl-5">
            {KEPT.map((item) => (
              <li key={item}>{t(`club.privacy.kept.${item}`)}</li>
            ))}
          </ul>
        </Section>
        {owner ? (
          <>
            <Section id="privacy-export" title={t('club.privacy.export.title')}>
              <p className="text-ink-soft">{t('club.privacy.export.body')}</p>
              <div>
                <Button
                  variant="secondary"
                  icon={<Download />}
                  loading={exportData.isPending}
                  onClick={() => {
                    exportData.mutate();
                  }}
                >
                  {t('club.privacy.export.button')}
                </Button>
              </div>
            </Section>
            <Section id="privacy-delete" title={t('club.privacy.delete.title')}>
              <p className="text-ink-soft">{t('club.privacy.delete.body')}</p>
              <div>
                <Button
                  variant="danger"
                  icon={<Trash2 />}
                  onClick={() => {
                    deleting.show(null);
                  }}
                >
                  {t('club.privacy.delete.button')}
                </Button>
              </div>
            </Section>
            <Section id="privacy-requests" title={t('club.privacy.requests.title')}>
              <RequestsTable />
            </Section>
          </>
        ) : (
          <ReadOnlyNote>{t('club.privacy.ownerOnly')}</ReadOnlyNote>
        )}
      </div>
      {deleting.key > 0 && (
        <DeleteClubSheet key={deleting.key} open={deleting.open} onClose={deleting.hide} />
      )}
    </>
  );
}
