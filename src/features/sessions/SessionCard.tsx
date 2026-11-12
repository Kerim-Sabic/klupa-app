import { useTranslation } from 'react-i18next';
import { EQUIPMENT, type Equipment } from '../../data/drills';
import type { SessionSummary } from '../../lib/data';
import { Pill, type PillTone } from '../../ui';
import type { SessionDrillRow } from './api';
import { DrillDetails } from './DrillDetails';
import { blockRanges, findDrill, formatDay, localized } from './format';

const STATUS_TONE: Record<SessionSummary['status'], PillTone> = {
  planned: 'mute',
  completed: 'pitch',
  cancelled: 'clay',
};

export function StatusPill({ status }: { readonly status: SessionSummary['status'] }) {
  const { t } = useTranslation();
  return <Pill tone={STATUS_TONE[status]}>{t(`sessions.status.${status}`)}</Pill>;
}

export interface SessionCardProps {
  readonly session: SessionSummary;
  readonly drills: readonly SessionDrillRow[];
}

/**
 * The plan as a coach carries it onto the pitch. It is also what gets printed, so it holds
 * no controls and reads in black on white (the print rules live in `PrintStyles`).
 */
export function SessionCard({ session, drills }: SessionCardProps) {
  const { t, i18n } = useTranslation();
  const known = drills.flatMap((row) => {
    const drill = findDrill(row.drill_key);
    return drill === undefined ? [] : [drill];
  });
  const bring: Equipment[] = EQUIPMENT.filter((item) =>
    known.some((drill) => drill.equipment.includes(item)),
  );
  const ranges = blockRanges(drills.map((row) => row.minutes));

  return (
    <article
      aria-labelledby="session-card-title"
      className="session-card rounded-card border border-line bg-raised p-4 text-ink sm:p-6"
    >
      <header className="flex flex-col gap-2 border-b border-line pb-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h2 id="session-card-title" className="font-display text-[22px] text-ink">
            {t(`sessions.focus.${session.focus}`, { defaultValue: session.focus })}
          </h2>
          <StatusPill status={session.status} />
        </div>
        <p className="text-[15px] text-ink-soft">
          {t('sessions.card.facts', {
            date: formatDay(session.held_on, i18n.language),
            minutes: session.duration_minutes,
            area: t(`sessions.areaFull.${session.area}`),
            players: session.expected_players,
          })}
          {session.floodlit && ` · ${t('sessions.planner.floodlit')}`}
        </p>
        {bring.length > 0 && (
          <p className="text-[15px] text-ink">
            <span className="font-semibold">{t('sessions.card.bring')} </span>
            {bring.map((item) => t(`sessions.equipment.${item}`)).join(', ')}
          </p>
        )}
      </header>
      <ol className="flex flex-col divide-y divide-line">
        {drills.map((row, index) => {
          const drill = findDrill(row.drill_key);
          const range = ranges[index] ?? { from: 0, to: row.minutes };
          return (
            <li key={row.id} className="flex flex-col gap-3 py-4 break-inside-avoid last:pb-0">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <h3 className="text-[17px] font-semibold text-ink">
                  {drill === undefined
                    ? row.drill_key
                    : `${String(row.position)}. ${localized(drill.name, i18n.language)}`}
                </h3>
                <span className="text-[13px] font-semibold text-ink-soft tabular-nums">
                  {t('sessions.planner.range', range)}
                </span>
              </div>
              {drill === undefined ? (
                <p className="text-[15px] text-ink-soft">{t('sessions.card.drillMissing')}</p>
              ) : (
                <DrillDetails drill={drill} summary={false} variations={false} headingLevel={4} />
              )}
            </li>
          );
        })}
      </ol>
    </article>
  );
}
