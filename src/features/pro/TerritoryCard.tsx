import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  GRID_COLUMNS,
  GRID_ROWS,
  THIRDS,
  territory,
  type Pair,
  type ProEvent,
} from '../../engine/pro';
import { formatPercent } from '../momentum/chartModel';
import { Card } from '../../ui';
import { PITCH_M, ProPitch } from './ProPitch';
import { cellLead } from './view';

const FILL = ['fill-home', 'fill-away'] as const;
/** Own third lightest, final third full strength. */
const BAR = [
  ['bg-home/35', 'bg-home/65', 'bg-home'],
  ['bg-away/35', 'bg-away/65', 'bg-away'],
] as const;
const TEXT = ['text-home', 'text-away'] as const;

/** Each third's share as a stacked bar, own goal on the left, with the shares written under it. */
function ThirdsBar({
  shares,
  team,
  name,
}: {
  readonly shares: Readonly<Record<string, number>>;
  readonly team: 0 | 1;
  readonly name: string;
}) {
  const { t, i18n } = useTranslation();
  return (
    <div>
      <p className={`text-footnote font-semibold ${TEXT[team]}`}>{name}</p>
      <div aria-hidden="true" className="mt-1 flex h-2.5 overflow-hidden rounded-full bg-mute-soft">
        {THIRDS.map((third, i) => (
          <span
            key={third}
            className={`h-full ${BAR[team][i] ?? ''}`}
            style={{ width: `${String((shares[third] ?? 0) * 100)}%` }}
          />
        ))}
      </div>
      <p className="mt-1 text-footnote text-ink-soft tabular-nums">
        {THIRDS.map(
          (third) =>
            `${t(`pro.territory.third.${third}`)} ${formatPercent(shares[third] ?? 0, i18n.language)}`,
        ).join(' · ')}
      </p>
    </div>
  );
}

/**
 * Where each team had the ball: every touch with a position on one pitch, home attacking left
 * to right. Each cell is coloured for the team with more touches there, stronger the more it
 * had, with its share written in.
 */
export function TerritoryCard({
  events,
  names,
}: {
  readonly events: readonly ProEvent[];
  readonly names: Pair<string>;
}) {
  const { t, i18n } = useTranslation();
  const result = useMemo(() => territory({ events }), [events]);
  const cellW = PITCH_M.length / GRID_COLUMNS;
  const cellH = PITCH_M.width / GRID_ROWS;
  const share = cellLead;

  return (
    <Card className="grid gap-4 lg:grid-cols-[3fr_2fr] lg:items-start lg:gap-8">
      <div className="flex flex-col gap-2">
        <p className="flex justify-between text-footnote font-semibold">
          <span className={TEXT[0]}>{`${names[0]} →`}</span>
          <span className={TEXT[1]}>{`← ${names[1]}`}</span>
        </p>
        <ProPitch label={t('pro.territory.label', { home: names[0], away: names[1] })}>
          {result.cells.map((cell) => {
            const lead = share(cell.touches);
            const x = -PITCH_M.length / 2 + cell.column * cellW;
            const y = -PITCH_M.width / 2 + cell.row * cellH;
            return (
              <g key={`${String(cell.column)}-${String(cell.row)}`}>
                {lead !== null && (
                  <rect
                    x={x}
                    y={y}
                    width={cellW}
                    height={cellH}
                    className={FILL[lead.team]}
                    opacity={Math.max(lead.value - 0.5, 0) * 1.4 + 0.06}
                  />
                )}
                {lead !== null && (
                  <text
                    x={x + cellW / 2}
                    y={y + cellH / 2 + 1.6}
                    textAnchor="middle"
                    fontSize={4.4}
                    className="fill-ink font-semibold tabular-nums"
                  >
                    {formatPercent(lead.value, i18n.language)}
                  </text>
                )}
              </g>
            );
          })}
        </ProPitch>
      </div>
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          <ThirdsBar shares={result.thirds[0]} team={0} name={names[0]} />
          <ThirdsBar shares={result.thirds[1]} team={1} name={names[1]} />
        </div>
        <div>
          <p className="text-footnote font-semibold text-ink">{t('pro.territory.finalThird')}</p>
          <div aria-hidden="true" className="mt-1 flex h-2.5 overflow-hidden rounded-full">
            <span
              className="h-full bg-home"
              style={{ width: `${String(result.finalThirdShareHome * 100)}%` }}
            />
            <span className="h-full flex-1 bg-away" />
          </div>
          <p className="mt-1 flex justify-between text-footnote text-ink-soft tabular-nums">
            <span>{`${names[0]} ${String(result.finalThirdPasses[0])}`}</span>
            <span>{`${String(result.finalThirdPasses[1])} ${names[1]}`}</span>
          </p>
        </div>
        <details className="text-footnote text-ink-soft">
          <summary className="min-h-11 cursor-pointer py-3 font-semibold text-ink">
            {t('pro.territory.table')}
          </summary>
          <table className="w-full tabular-nums">
            <caption className="sr-only">{t('pro.territory.caption')}</caption>
            <thead>
              <tr>
                <th scope="col" className="text-left">
                  {t('pro.territory.col.zone')}
                </th>
                <th scope="col" className="text-right">
                  {names[0]}
                </th>
                <th scope="col" className="text-right">
                  {names[1]}
                </th>
              </tr>
            </thead>
            <tbody>
              {result.cells.map((cell) => (
                <tr
                  key={`${String(cell.column)}-${String(cell.row)}`}
                  className="border-t border-hairline"
                >
                  <th scope="row" className="py-1 text-left font-normal">
                    {t('pro.territory.zone', { column: cell.column + 1, row: cell.row + 1 })}
                  </th>
                  <td className="text-right">{cell.touches[0]}</td>
                  <td className="text-right">{cell.touches[1]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </div>
    </Card>
  );
}
