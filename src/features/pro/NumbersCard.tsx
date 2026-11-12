import { useTranslation } from 'react-i18next';
import type { Pair, TeamStats } from '../../engine/pro';
import { Card } from '../../ui';
import { comparisonRows } from './view';

/**
 * The match in numbers as a real table: home value, what it is, away value. Each row carries a
 * mirrored bar, home growing left from the middle and away growing right, sized by each side's
 * part of the pair.
 */
export function NumbersCard({
  stats,
  names,
}: {
  readonly stats: Pair<TeamStats>;
  readonly names: Pair<string>;
}) {
  const { t, i18n } = useTranslation();
  const rows = comparisonRows(stats, i18n.language);
  return (
    <Card padded={false} className="px-4 py-3 sm:px-5">
      <table className="w-full border-collapse tabular-nums">
        <caption className="sr-only">
          {t('pro.numbers.caption', { home: names[0], away: names[1] })}
        </caption>
        <thead>
          <tr className="text-footnote font-semibold">
            <th scope="col" className="w-[28%] pb-2 text-left text-home">
              {names[0]}
            </th>
            <th scope="col" className="pb-2 text-center text-ink-soft">
              <span className="sr-only">{t('pro.numbers.measure')}</span>
            </th>
            <th scope="col" className="w-[28%] pb-2 text-right text-away">
              {names[1]}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-t border-hairline">
              <td className="py-2.5 pr-2 align-top">
                <span className="block text-[17px] font-semibold text-ink">{row.display[0]}</span>
                <span
                  aria-hidden="true"
                  className="mt-1.5 flex h-1.5 justify-end rounded-full bg-mute-soft"
                >
                  <span
                    className="h-full rounded-full bg-home"
                    style={{ width: `${String(row.share[0] * 100)}%` }}
                  />
                </span>
              </td>
              <th
                scope="row"
                className="px-1 pt-3 pb-2.5 text-center align-top text-footnote font-medium text-ink-soft"
              >
                {t(`pro.numbers.row.${row.key}`)}
              </th>
              <td className="py-2.5 pl-2 text-right align-top">
                <span className="block text-[17px] font-semibold text-ink">{row.display[1]}</span>
                <span aria-hidden="true" className="mt-1.5 flex h-1.5 rounded-full bg-mute-soft">
                  <span
                    className="h-full rounded-full bg-away"
                    style={{ width: `${String(row.share[1] * 100)}%` }}
                  />
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-footnote text-ink-soft">{t('pro.numbers.note')}</p>
    </Card>
  );
}
