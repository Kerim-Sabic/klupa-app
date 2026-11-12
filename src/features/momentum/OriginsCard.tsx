import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { SIDES, type Side } from '../../engine';
import { Card } from '../../ui';
import { formatXg } from './chartModel';
import { chanceOrigins, type OriginProfile } from './origins';
import type { ReviewEvent } from './reviewModel';

const BAR: Record<Side, string> = { home: 'bg-home', away: 'bg-away' };

function SideTable({ profile, team }: { readonly profile: OriginProfile; readonly team: string }) {
  const { t, i18n } = useTranslation();
  const widest = Math.max(1, ...profile.rows.map((row) => row.chances));
  return (
    <Card className="flex flex-col gap-3">
      <table className="w-full border-collapse text-left tabular-nums">
        <caption className="mb-2 text-left font-semibold text-ink">
          {t('review.origins.caption', { team, chances: profile.chances })}
        </caption>
        <thead>
          <tr className="text-footnote text-ink-soft">
            <th scope="col" className="pb-1 font-medium">
              {t('review.origins.col.origin')}
            </th>
            <th scope="col" className="pb-1 pl-3 text-right font-medium">
              {t('review.origins.col.chances')}
            </th>
            <th scope="col" className="pb-1 pl-3 text-right font-medium">
              {t('review.origins.col.goals')}
            </th>
            <th scope="col" className="pb-1 pl-3 text-right font-medium">
              {t('review.origins.col.quality')}
            </th>
          </tr>
        </thead>
        <tbody>
          {profile.rows.map((row) => (
            <tr key={row.origin} className="border-t border-hairline align-top">
              <th scope="row" className="py-2 pr-3 font-normal text-ink">
                {t(`review.origins.origin.${row.origin}`)}
                {/* The bar repeats the count beside it, so it is decoration for a screen reader. */}
                <span aria-hidden="true" className="mt-1.5 block h-1.5 rounded-full bg-mute-soft">
                  <span
                    className={`block h-full rounded-full ${BAR[profile.side]}`}
                    style={{ width: `${String((row.chances / widest) * 100)}%` }}
                  />
                </span>
              </th>
              <td className="py-2 pl-3 text-right font-semibold text-ink">{row.chances}</td>
              <td className="py-2 pl-3 text-right text-ink">{row.goals}</td>
              <td className="py-2 pl-3 text-right text-ink">
                {formatXg(row.units, i18n.language)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-footnote text-ink-soft">
        {profile.pattern === null
          ? t(profile.chances === 0 ? 'review.origins.none' : 'review.origins.noPattern')
          : t('review.origins.pattern', {
              origin: t(`review.origins.origin.${profile.pattern.origin}`),
              count: profile.pattern.chances,
              total: profile.chances,
            })}
      </p>
    </Card>
  );
}

/** For each side: what was tagged just before its chances, as counts, goals and chance quality. */
export function OriginsCard({
  events,
  sideNames,
}: {
  readonly events: readonly ReviewEvent[];
  readonly sideNames: Readonly<Record<Side, string>>;
}) {
  const origins = useMemo(() => chanceOrigins(events), [events]);
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {SIDES.map((side) => (
        <SideTable key={side} profile={origins[side]} team={sideNames[side]} />
      ))}
    </div>
  );
}
