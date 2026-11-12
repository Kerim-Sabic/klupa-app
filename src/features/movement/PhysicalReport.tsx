import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Side } from '../../engine/types';
import {
  Card,
  CardTitle,
  DataTable,
  ErrorNotice,
  Segmented,
  SkeletonText,
  type Column,
} from '../../ui';
import { useClubName } from './clubs';
import { formatNumber } from './format';
import {
  compareTeams,
  kmh,
  playersOf,
  type ComparisonRow,
  type PhysicalPlayer,
  type PhysicalReport as Report,
} from './physical';
import { usePhysical } from './useTrackingData';

const SIDES: readonly Side[] = ['home', 'away'];
const MARK: Readonly<Record<Side, string>> = {
  home: 'rounded-full bg-home',
  away: 'rounded-[2px] bg-away',
};

function useValueText() {
  const { t, i18n } = useTranslation();
  const n = (value: number, digits: number) => formatNumber(value, digits, i18n.language);
  return (key: ComparisonRow['key'], value: number, full = false): string => {
    if (key === 'sprints') return n(value, 0);
    if (key === 'topSpeed') {
      return full
        ? t('movement.physical.topSpeedFull', { kmh: n(kmh(value), 1), mps: n(value, 2) })
        : t('movement.physical.kmh', { value: n(kmh(value), 1) });
    }
    return t('movement.physical.km', { value: n(value, key === 'distanceKm' ? 1 : 2) });
  };
}

/** Both clubs' totals side by side: the first club's bars grow left, the second's right. */
function TeamComparison({ report }: { readonly report: Report }) {
  const { t, i18n } = useTranslation();
  const club = useClubName();
  const text = useValueText();
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        {SIDES.map((side) => (
          <div key={side} className={side === 'away' ? 'text-right' : undefined}>
            <p
              className={`flex items-center gap-2 font-semibold ${side === 'away' ? 'flex-row-reverse' : ''}`}
            >
              <span aria-hidden="true" className={`size-3 shrink-0 ${MARK[side]}`} />
              <span className="min-w-0 break-words">{club(side)}</span>
            </p>
            <p className="text-[13px] text-ink-soft">
              {t('movement.physical.used', {
                players: report.totals[side].players,
                minutes: formatNumber(report.totals[side].minutes, 0, i18n.language),
              })}
            </p>
          </div>
        ))}
      </div>
      <ul className="flex flex-col gap-3">
        {compareTeams(report).map((row) => {
          const label = t(`movement.physical.metric.${row.key}`);
          return (
            <li key={row.key}>
              <p className="sr-only">
                {`${label}: ${club('home')} ${text(row.key, row.values.home, true)}, ${club('away')} ${text(row.key, row.values.away, true)}`}
              </p>
              <div aria-hidden="true">
                <p className="text-center text-[13px] font-semibold text-ink-soft">{label}</p>
                <div className="mt-1 grid grid-cols-2 items-center gap-1">
                  {SIDES.map((side) => (
                    <div
                      key={side}
                      className={`flex items-center gap-2 ${side === 'home' ? 'flex-row' : 'flex-row-reverse'}`}
                    >
                      <span
                        className={`w-[5.5rem] shrink-0 font-semibold tabular-nums max-sm:w-[4.75rem] max-sm:text-[13px] ${side === 'away' ? 'text-right' : ''}`}
                      >
                        {text(row.key, row.values[side])}
                      </span>
                      <span
                        className={`flex h-2.5 flex-1 ${side === 'home' ? 'justify-end' : 'justify-start'}`}
                      >
                        <span
                          className={`h-full ${side === 'home' ? 'rounded-l-full bg-home' : 'rounded-r-full bg-away'}`}
                          style={{ width: `${(row.shares[side] * 100).toFixed(1)}%` }}
                        />
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function usePlayerColumns(): Column<PhysicalPlayer>[] {
  const { t, i18n } = useTranslation();
  const n = (value: number, digits: number) => formatNumber(value, digits, i18n.language);
  const col = (key: string) => t(`movement.physical.col.${key}`);
  return [
    { id: 'shirt', header: col('shirt'), cell: (p) => p.shirt, sortValue: (p) => p.shirt },
    { id: 'name', header: col('name'), cell: (p) => p.name, sortValue: (p) => p.name },
    {
      id: 'minutes',
      header: col('minutes'),
      align: 'right',
      cell: (p) => n(p.minutes, 0),
      sortValue: (p) => p.minutes,
    },
    {
      id: 'distance',
      header: col('distance'),
      align: 'right',
      cell: (p) => n(p.distanceKm, 2),
      sortValue: (p) => p.distanceKm,
    },
    {
      id: 'highSpeed',
      header: col('highSpeed'),
      align: 'right',
      cell: (p) => n(p.highSpeedKm, 2),
      sortValue: (p) => p.highSpeedKm,
    },
    {
      id: 'sprints',
      header: col('sprints'),
      align: 'right',
      cell: (p) => p.sprints,
      sortValue: (p) => p.sprints,
    },
    {
      id: 'topSpeed',
      header: col('topSpeed'),
      align: 'right',
      cell: (p) => (
        <>
          <span aria-hidden="true">{n(kmh(p.topSpeed), 1)}</span>
          <span className="sr-only">
            {t('movement.physical.topSpeedFull', {
              kmh: n(kmh(p.topSpeed), 1),
              mps: n(p.topSpeed, 2),
            })}
          </span>
        </>
      ),
      sortValue: (p) => p.topSpeed,
    },
  ];
}

function Definitions({ report }: { readonly report: Report }) {
  const { t, i18n } = useTranslation();
  const n = (value: number, digits: number) => formatNumber(value, digits, i18n.language);
  const d = report.definitions;
  const items = [
    t('movement.physical.def.speed', { hz: d.sampleRateHz }),
    t('movement.physical.def.minutes'),
    t('movement.physical.def.distance'),
    t('movement.physical.def.highSpeed', {
      mps: n(d.highSpeedMps, 1),
      kmh: n(kmh(d.highSpeedMps), 1),
    }),
    t('movement.physical.def.sprints', {
      seconds: n(d.sprintSeconds, 1),
      mps: n(d.sprintMps, 1),
      kmh: n(kmh(d.sprintMps), 1),
    }),
    t('movement.physical.def.topSpeed'),
  ];
  return (
    <div className="flex flex-col gap-2 text-[13px] text-ink-soft">
      <h3 className="text-[15px] font-semibold text-ink">
        {t('movement.physical.definitionsTitle')}
      </h3>
      <ul className="flex list-disc flex-col gap-1 pl-5">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <p>
        {t('movement.physical.quality', {
          seconds: n(report.quality.excludedPlayerSeconds, 0),
          share: formatNumber(report.quality.shareOfPlayerTime * 100, 3, i18n.language),
          jump: n(d.jumpMps, 0),
        })}
      </p>
      <p>{t('movement.physical.names')}</p>
    </div>
  );
}

/** One club's players at a time: a phone shows each player as a card, so both at once is long. */
function PlayerTable({ report }: { readonly report: Report }) {
  const { t } = useTranslation();
  const club = useClubName();
  const columns = usePlayerColumns();
  const [side, setSide] = useState<Side>('home');
  return (
    <div className="flex flex-col gap-3">
      <Segmented
        label={t('movement.physical.clubLabel')}
        options={SIDES.map((value) => ({ value, label: club(value) }))}
        value={side}
        onChange={setSide}
      />
      <DataTable
        key={side}
        caption={t('movement.physical.tableCaption', { club: club(side) })}
        columns={columns}
        rows={playersOf(report, side)}
        getRowId={(p) => `${p.side}-${String(p.shirt)}`}
        initialSort={{ columnId: 'distance', direction: 'desc' }}
      />
    </div>
  );
}

/**
 * How much each player ran, from the match's own physical file. Fetched on its own, after
 * the replay has started loading, so the replay never waits for it.
 */
export function PhysicalSection({ matchId }: { readonly matchId: string }) {
  const { t } = useTranslation();
  const { state, retry } = usePhysical(matchId);

  return (
    <Card
      as="section"
      aria-labelledby="movement-physical-title"
      className="flex scroll-mt-20 flex-col gap-5"
    >
      <div className="flex flex-col gap-1">
        <CardTitle>
          <span id="movement-physical-title">{t('movement.physical.title')}</span>
        </CardTitle>
        <p className="text-[15px] text-ink-soft">{t('movement.physical.intro')}</p>
      </div>
      {state.phase === 'loading' && (
        <div role="status" aria-label={t('movement.physical.loading')}>
          <SkeletonText lines={6} />
        </div>
      )}
      {state.phase === 'error' && (
        <ErrorNotice
          title={t('movement.physical.errorTitle')}
          body={t('movement.physical.errorBody')}
          onRetry={retry}
        />
      )}
      {state.phase === 'ready' && (
        <>
          <section aria-label={t('movement.physical.compareTitle')} className="flex flex-col gap-3">
            <h3 className="text-[15px] font-semibold">{t('movement.physical.compareTitle')}</h3>
            <TeamComparison report={state.value} />
          </section>
          <PlayerTable report={state.value} />
          <Definitions report={state.value} />
        </>
      )}
    </Card>
  );
}
