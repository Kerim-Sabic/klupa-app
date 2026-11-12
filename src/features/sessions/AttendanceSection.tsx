import { Users } from 'lucide-react';
import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { Player, SessionSummary } from '../../lib/data';
import { EmptyState, ErrorNotice, LinkButton, Skeleton } from '../../ui';
import { useSessionAttendance, useSessionObservations } from './hooks';
import { PlayerRow } from './PlayerRow';
import { summarize } from './summary';
import { SummaryStrip } from './SummaryStrip';
import { EMPTY_TALLY, EXPECTED, type AttendanceValue, type Tally } from './tally';

export interface AttendanceSectionProps {
  readonly session: SessionSummary;
  readonly squad: readonly Player[];
}

/** Attendance, effort and the focus-skill counters for the whole squad, saved as you tap. */
export function AttendanceSection({ session, squad }: AttendanceSectionProps) {
  const { t } = useTranslation();
  const attendance = useSessionAttendance(session.id);
  const observations = useSessionObservations(session.id, session.focus);

  const attendanceById = useMemo(
    () =>
      new Map<string, AttendanceValue>(
        (attendance.data ?? []).map((row) => [
          row.player_id,
          { status: row.status, minutes: row.minutes, rpe: row.rpe },
        ]),
      ),
    [attendance.data],
  );
  const talliesById = useMemo(
    () =>
      new Map<string, Tally>(
        (observations.data ?? []).map((row) => [
          row.player_id,
          { attempts: row.attempts, successes: row.successes },
        ]),
      ),
    [observations.data],
  );
  const summary = useMemo(
    () =>
      summarize({
        playerIds: squad.map((player) => player.id),
        attendance: attendanceById,
        tallies: talliesById,
      }),
    [squad, attendanceById, talliesById],
  );

  let body: ReactNode;
  if (squad.length === 0) {
    body = (
      <EmptyState
        icon={<Users />}
        title={t('sessions.attendance.noSquadTitle')}
        body={t('sessions.attendance.noSquadBody')}
        action={<LinkButton to="/club">{t('sessions.attendance.noSquadAction')}</LinkButton>}
      />
    );
  } else if (attendance.isPending || observations.isPending) {
    body = (
      <div role="status" aria-label={t('ui.loading')} className="flex flex-col gap-3">
        {[0, 1, 2].map((index) => (
          <Skeleton key={index} className="h-24 w-full rounded-card" />
        ))}
      </div>
    );
  } else if (attendance.isError || observations.isError) {
    body = (
      <ErrorNotice
        title={t('errors.loadFailed')}
        onRetry={() => {
          void attendance.refetch();
          void observations.refetch();
        }}
      />
    );
  } else {
    body = (
      <>
        <SummaryStrip summary={summary} />
        <p className="text-[13px] text-ink-soft">{t('sessions.counters.rule')}</p>
        <ul className="flex flex-col gap-3">
          {squad.map((player) => (
            <PlayerRow
              key={player.id}
              sessionId={session.id}
              skill={session.focus}
              player={player}
              attendance={attendanceById.get(player.id) ?? EXPECTED}
              tally={talliesById.get(player.id) ?? EMPTY_TALLY}
              sessionMinutes={session.duration_minutes}
            />
          ))}
        </ul>
      </>
    );
  }

  return (
    <section aria-labelledby="attendance-heading" className="flex flex-col gap-4 print:hidden">
      <h2 id="attendance-heading" className="text-[22px] font-semibold text-ink">
        {t('sessions.attendance.title')}
      </h2>
      {body}
    </section>
  );
}
