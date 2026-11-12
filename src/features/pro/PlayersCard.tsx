import { useTranslation } from 'react-i18next';
import type { PlayerLine, TeamIndex } from '../../engine/pro';
import { formatPercent, formatXg } from '../momentum/chartModel';
import { DataTable, type Column } from '../../ui';

const NAME_TEXT: Readonly<Record<TeamIndex, string>> = { 0: 'text-home', 1: 'text-away' };

function useColumns(): Column<PlayerLine>[] {
  const { t, i18n } = useTranslation();
  const accuracy = (line: PlayerLine) =>
    line.passAccuracy === null ? '–' : formatPercent(line.passAccuracy, i18n.language);
  return [
    {
      id: 'name',
      header: t('pro.players.col.name'),
      cell: (line) => (
        <span className="font-semibold text-ink">
          {line.name}
          {!line.starter && (
            <span className="ml-1.5 text-footnote font-normal text-ink-soft">
              {t('pro.players.sub')}
            </span>
          )}
        </span>
      ),
      sortValue: (line) => line.name,
    },
    {
      id: 'minutes',
      header: t('pro.players.col.minutes'),
      cell: (l) => l.minutes,
      sortValue: (l) => l.minutes,
      align: 'right',
    },
    {
      id: 'passes',
      header: t('pro.players.col.passes'),
      cell: (l) => l.passes,
      sortValue: (l) => l.passes,
      align: 'right',
    },
    {
      id: 'accuracy',
      header: t('pro.players.col.accuracy'),
      cell: accuracy,
      sortValue: (l) => l.passAccuracy,
      align: 'right',
    },
    {
      id: 'keyPasses',
      header: t('pro.players.col.keyPasses'),
      cell: (l) => l.keyPasses,
      sortValue: (l) => l.keyPasses,
      align: 'right',
    },
    {
      id: 'shots',
      header: t('pro.players.col.shots'),
      cell: (l) => l.shots,
      sortValue: (l) => l.shots,
      align: 'right',
    },
    {
      id: 'chance',
      header: t('pro.players.col.chance'),
      cell: (l) => formatXg(l.xgUnits, i18n.language),
      sortValue: (l) => l.xgUnits,
      align: 'right',
    },
    {
      id: 'duels',
      header: t('pro.players.col.duels'),
      cell: (l) => `${String(l.duelsWon)}/${String(l.duels)}`,
      sortValue: (l) => l.duelsWon,
      align: 'right',
    },
    {
      id: 'interceptions',
      header: t('pro.players.col.interceptions'),
      cell: (l) => l.interceptions,
      sortValue: (l) => l.interceptions,
      align: 'right',
    },
  ];
}

/** Phone: one compact row per player, the name and minutes over a line of the key numbers. */
function CompactRows({
  lines,
  team,
  caption,
}: {
  readonly lines: readonly PlayerLine[];
  readonly team: TeamIndex;
  readonly caption: string;
}) {
  const { t, i18n } = useTranslation();
  return (
    <div className="sm:hidden">
      <h3 className={`pb-2 text-headline font-semibold ${NAME_TEXT[team]}`}>{caption}</h3>
      <ul className="overflow-hidden rounded-card border border-hairline bg-raised shadow-card">
        {lines.map((line) => (
          <li key={line.player} className="border-b border-hairline px-4 py-2.5 last:border-b-0">
            <p className="flex items-baseline justify-between gap-3">
              <span className="font-semibold text-ink">
                {line.name}
                {!line.starter && (
                  <span className="ml-1.5 text-footnote font-normal text-ink-soft">
                    {t('pro.players.sub')}
                  </span>
                )}
              </span>
              <span className="shrink-0 text-footnote text-ink-soft tabular-nums">
                {t('pro.players.minutes', { minutes: line.minutes })}
              </span>
            </p>
            <p className="mt-0.5 text-footnote text-ink-soft tabular-nums">
              {t('pro.players.compact', {
                passes: line.passes,
                accuracy:
                  line.passAccuracy === null
                    ? '–'
                    : formatPercent(line.passAccuracy, i18n.language),
                shots: line.shots,
                chance: formatXg(line.xgUnits, i18n.language),
                duels: `${String(line.duelsWon)}/${String(line.duels)}`,
                interceptions: line.interceptions,
              })}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Each team's players: a sortable table from a small tablet up, compact rows on a phone. */
export function PlayersCard({
  players,
  names,
}: {
  readonly players: readonly PlayerLine[];
  readonly names: readonly [string, string];
}) {
  const { t } = useTranslation();
  const columns = useColumns();
  return (
    <div className="grid gap-6">
      {([0, 1] as const).map((team) => {
        const lines = players.filter((line) => line.team === team);
        const caption = t('pro.players.caption', { team: names[team] });
        return (
          <div key={team}>
            <CompactRows lines={lines} team={team} caption={caption} />
            <div className="max-sm:hidden">
              <DataTable
                caption={caption}
                columns={columns}
                rows={lines}
                getRowId={(line) => String(line.player)}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
