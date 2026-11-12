import { useTranslation } from 'react-i18next';
import { Card, CardTitle, RevealList } from '../../ui';
import { MIN_ATTEMPTS, type LedgerRow } from './models';
import { PlayerName } from './PlayerName';

/** What is missing for one player, in plain words. Only what is missing is said. */
function Missing({ row }: { readonly row: LedgerRow }) {
  const { t } = useTranslation();
  return (
    <div className="mt-1 flex flex-col gap-0.5 text-[15px] text-ink-soft">
      <p>
        {row.attempts === 0
          ? t('insights.second.noAttempts')
          : t('insights.second.observed', {
              attempts: t('insights.units.attempts', { count: row.attempts }),
              sessions: t('insights.units.inSessions', { count: row.sessionsObserved }),
            })}
      </p>
      {row.matchMinutes === 0 && <p>{t('insights.second.noMinutes')}</p>}
    </div>
  );
}

/**
 * Who has not had a fair look yet. The engine orders it by how little was observed; the words
 * say so, because a list on a coach's screen is easily read as a league table.
 */
export function SecondLook({ rows }: { readonly rows: readonly LedgerRow[] }) {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="second-look-title" className="flex flex-col gap-3">
      <h2 id="second-look-title" className="text-[22px] font-semibold text-ink">
        {t('insights.second.title')}
      </h2>
      <p className="max-w-prose text-[15px] text-ink">{t('insights.second.note')}</p>
      {rows.length === 0 ? (
        <p className="text-[15px] text-ink-soft">
          {t('insights.second.none', { min: MIN_ATTEMPTS })}
        </p>
      ) : (
        <RevealList as="ul" className="grid gap-3 sm:grid-cols-2">
          {rows.map((row) => (
            <Card as="li" key={row.playerId}>
              <CardTitle as="h3">
                <PlayerName shirt={row.shirt} label={row.label} />
              </CardTitle>
              <Missing row={row} />
            </Card>
          ))}
        </RevealList>
      )}
    </section>
  );
}
