import { useTranslation } from 'react-i18next';
import { DataTable, type Column } from '../../ui';
import { useFormatter, type Formatter } from './format';
import { IntervalBar } from './IntervalBar';
import { INTERVAL_LEVEL, MIN_ATTEMPTS, type LedgerRow } from './models';
import { PlayerName } from './PlayerName';

function AdjustedCell({ row, format }: { readonly row: LedgerRow; readonly format: Formatter }) {
  const { t } = useTranslation();
  if (row.adjusted === null) {
    return <span className="text-ink-soft">{t('insights.ledger.noAdjusted')}</span>;
  }
  const { point, interval } = row.adjusted;
  const level = format.number(Math.round(INTERVAL_LEVEL * 100));
  const range =
    interval === null
      ? null
      : t('insights.ledger.range', {
          low: format.percent(interval.lower),
          high: format.percent(interval.upper),
        });
  const description =
    interval === null
      ? t('insights.ledger.barLabelNoRange', { point: format.percent(point) })
      : t('insights.ledger.barLabel', {
          point: format.percent(point),
          range,
          level,
        });
  return (
    <div className="flex flex-col items-end gap-1 sm:items-start">
      <IntervalBar point={point} interval={interval} description={description} />
      <span className="tabular-nums">
        {format.percent(point)}
        {range !== null && <span className="ml-1.5 text-[13px] text-ink-soft">{range}</span>}
      </span>
    </div>
  );
}

/**
 * Minutes given and what was observed, side by side. Every rate carries its count, and the
 * adjusted rate carries its doubt as a bar, so two from two is visibly a wide one.
 */
export function Ledger({ rows }: { readonly rows: readonly LedgerRow[] }) {
  const { t } = useTranslation();
  const format = useFormatter();
  const columns: Column<LedgerRow>[] = [
    {
      id: 'player',
      header: t('insights.ledger.col.player'),
      cell: (row) => <PlayerName shirt={row.shirt} label={row.label} />,
      sortValue: (row) => row.shirt,
    },
    {
      id: 'minutes',
      header: t('insights.ledger.col.minutes'),
      cell: (row) => format.number(row.matchMinutes),
      sortValue: (row) => row.matchMinutes,
      align: 'right',
    },
    {
      id: 'share',
      header: t('insights.ledger.col.share'),
      cell: (row) => format.percent(row.minutesShare),
      sortValue: (row) => row.minutesShare,
      align: 'right',
    },
    {
      id: 'versus',
      header: t('insights.ledger.col.versus'),
      cell: (row) => format.signed(row.minutesVersusEqual),
      sortValue: (row) => row.minutesVersusEqual,
      align: 'right',
    },
    {
      id: 'training',
      header: t('insights.ledger.col.training'),
      cell: (row) => format.number(row.trainingMinutes),
      sortValue: (row) => row.trainingMinutes,
      align: 'right',
    },
    {
      id: 'attempts',
      header: t('insights.ledger.col.attempts'),
      cell: (row) => format.number(row.attempts),
      sortValue: (row) => row.attempts,
      align: 'right',
    },
    {
      id: 'observed',
      header: t('insights.ledger.col.observed'),
      cell: (row) =>
        row.rawRate === null ? (
          <span className="text-ink-soft">{t('insights.ledger.noAttempts')}</span>
        ) : (
          <span className="tabular-nums">
            {format.percent(row.rawRate)}{' '}
            <span className="text-[13px] text-ink-soft">
              {t('insights.ledger.ofAttempts', {
                successes: row.successes,
                attempts: row.attempts,
              })}
            </span>
          </span>
        ),
      sortValue: (row) => row.rawRate,
      align: 'right',
    },
    {
      id: 'adjusted',
      header: t('insights.ledger.col.adjusted'),
      cell: (row) => <AdjustedCell row={row} format={format} />,
      sortValue: (row) => row.adjusted?.point ?? null,
    },
  ];

  return (
    <section aria-labelledby="ledger-title" className="flex flex-col gap-3">
      <h2 id="ledger-title" className="text-[22px] font-semibold text-ink">
        {t('insights.ledger.title')}
      </h2>
      <DataTable
        caption={t('insights.ledger.caption')}
        columns={columns}
        rows={rows}
        getRowId={(row) => row.playerId}
        initialSort={{ columnId: 'player', direction: 'asc' }}
      />
      <p className="max-w-prose text-[15px] text-ink">{t('insights.ledger.shrinkage')}</p>
      <p className="max-w-prose text-[13px] text-ink-soft">
        {t('insights.ledger.barKey', {
          level: format.number(Math.round(INTERVAL_LEVEL * 100)),
          min: MIN_ATTEMPTS,
        })}
      </p>
    </section>
  );
}
