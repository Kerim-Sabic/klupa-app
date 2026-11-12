import { Users } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { LoadStatus } from '../../engine';
import {
  DataTable,
  EmptyState,
  LinkButton,
  Pill,
  Reveal,
  type Column,
  type PillTone,
} from '../../ui';
import { BarChart, type Bar } from './BarChart';
import { Callout } from './Callout';
import { useFormatter } from './format';
import { buildLoadModel, type LoadInput, type LoadModel, type LoadRowModel } from './models';
import { useLoadSource } from './queries';
import { PlayerName } from './PlayerName';
import { SourceView } from './SourceView';
import { localIsoDate } from './transform';

/** Only a steady week is "stable". A sharp increase is a prompt to talk, so amber, never clay. */
const STATUS_TONE: Readonly<Record<LoadStatus, PillTone>> = {
  no_data: 'mute',
  incomplete: 'mute',
  no_baseline: 'mute',
  steady: 'pitch',
  sharp_increase: 'amber',
};

function StatusCell({ status }: { readonly status: LoadStatus }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-end gap-1 sm:items-start">
      <Pill tone={STATUS_TONE[status]}>{t(`insights.load.status.${status}.label`)}</Pill>
      <span className="max-w-[28ch] text-[13px] text-ink-soft">
        {t(`insights.load.status.${status}.explain`)}
      </span>
    </div>
  );
}

function LoadTable({ rows }: { readonly rows: readonly LoadRowModel[] }) {
  const { t } = useTranslation();
  const format = useFormatter();
  const dash = <span className="text-ink-soft">{t('insights.load.none')}</span>;
  const columns: Column<LoadRowModel>[] = [
    {
      id: 'player',
      header: t('insights.load.col.player'),
      cell: (row) => <PlayerName shirt={row.shirt} label={row.label} />,
      sortValue: (row) => row.shirt,
    },
    {
      id: 'load',
      header: t('insights.load.col.load'),
      cell: (row) => (row.status === 'no_data' ? dash : format.number(row.load)),
      sortValue: (row) => (row.status === 'no_data' ? null : row.load),
      align: 'right',
    },
    {
      id: 'change',
      header: t('insights.load.col.change'),
      cell: (row) => (row.ratio === null ? dash : format.signedPercent(row.ratio - 1)),
      sortValue: (row) => (row.ratio === null ? null : row.ratio),
      align: 'right',
    },
    {
      id: 'sessions',
      header: t('insights.load.col.sessions'),
      cell: (row) => format.number(row.sessions),
      sortValue: (row) => row.sessions,
      align: 'right',
    },
    {
      id: 'status',
      header: t('insights.load.col.status'),
      cell: (row) => <StatusCell status={row.status} />,
      sortValue: (row) => t(`insights.load.status.${row.status}.label`),
    },
    {
      id: 'match',
      header: t('insights.load.col.match'),
      cell: (row) => format.number(row.matchMinutes),
      sortValue: (row) => row.matchMinutes,
      align: 'right',
    },
  ];
  return (
    <section aria-labelledby="load-table-title" className="flex flex-col gap-3">
      <h2 id="load-table-title" className="text-[22px] font-semibold text-ink">
        {t('insights.load.tableTitle')}
      </h2>
      <DataTable
        caption={t('insights.load.caption')}
        columns={columns}
        rows={rows}
        getRowId={(row) => row.playerId}
        initialSort={{ columnId: 'player', direction: 'asc' }}
      />
      <p className="max-w-prose text-[13px] text-ink-soft">{t('insights.load.matchNote')}</p>
    </section>
  );
}

function WeeklyChart({ weeks }: { readonly weeks: LoadModel['weeks'] }) {
  const { t } = useTranslation();
  const format = useFormatter();
  const bars: Bar[] = weeks.map((week) => ({
    key: week.weekStart,
    label: format.shortDate(week.weekStart),
    value: week.load,
    valueText: format.number(week.load),
  }));
  const items = weeks
    .map((week) =>
      t('insights.load.chartItem', {
        week: format.shortDate(week.weekStart),
        load: format.number(week.load),
        players: week.players,
      }),
    )
    .join('; ');
  return (
    <section aria-labelledby="load-chart-title" className="flex flex-col gap-3">
      <h2 id="load-chart-title" className="text-[22px] font-semibold text-ink">
        {t('insights.load.chartTitle')}
      </h2>
      <figure className="flex flex-col gap-2">
        <BarChart
          bars={bars}
          max={Math.max(0, ...weeks.map((week) => week.load))}
          description={t('insights.load.chartLabel', { items })}
        />
        <figcaption className="max-w-prose text-[13px] text-ink-soft">
          {t('insights.load.chartNote')}
        </figcaption>
      </figure>
    </section>
  );
}

function LoadBody({ input }: { readonly input: LoadInput }) {
  const { t } = useTranslation();
  const { players, stints, attendance, today } = input;
  const model = useMemo(
    () => buildLoadModel({ players, stints, attendance, today }),
    [players, stints, attendance, today],
  );
  if (players.length === 0) {
    return (
      <EmptyState
        icon={<Users />}
        title={t('insights.fair.noSquad.title')}
        body={t('insights.fair.noSquad.body')}
        action={<LinkButton to="/club/squad">{t('insights.fair.noSquad.action')}</LinkButton>}
      />
    );
  }
  return (
    <Reveal>
      <div className="flex flex-col gap-8">
        <Callout>{t('insights.load.callout')}</Callout>
        {model.hasEntries ? (
          <>
            <LoadTable rows={model.rows} />
            <WeeklyChart weeks={model.weeks} />
          </>
        ) : (
          <EmptyState
            icon={<Users />}
            title={t('insights.load.empty.title')}
            body={t('insights.load.empty.body')}
            action={<LinkButton to="/training">{t('insights.load.empty.action')}</LinkButton>}
          />
        )}
        {model.missingMinutes > 0 && (
          <p className="text-[13px] text-ink-soft">
            {t('insights.load.missingMinutes', { count: model.missingMinutes })}
          </p>
        )}
      </div>
    </Reveal>
  );
}

/** Training load: change from week to week, said as change, never as risk. */
export function LoadView() {
  // The date is read once per visit: a coach reading a screen is reading "today", not a clock.
  const today = useMemo(() => localIsoDate(new Date()), []);
  const source = useLoadSource(today);
  return <SourceView source={source}>{(input) => <LoadBody input={input} />}</SourceView>;
}
