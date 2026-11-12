import { useTranslation } from 'react-i18next';
import type { Player } from '../../lib/data';
import { Card, Segmented, type SegmentedOption } from '../../ui';
import { cx, Stepper } from './controls';
import { useSaveAttendance, useSaveObservation } from './hooks';
import {
  markStatus,
  MAX_ATTEMPTS,
  MAX_MINUTES,
  setAttempts,
  setMinutes,
  setSuccesses,
  toggleEffort,
  type AttendanceStatus,
  type AttendanceValue,
  type Tally,
} from './tally';

const RATINGS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

interface EffortChipsProps {
  readonly value: number | null;
  readonly player: string;
  readonly onSelect: (rating: number) => void;
}

/** Ten chips, 1 (easy) to 10 (maximal). Two rows of five on a phone keeps every chip 44 px wide. */
function EffortChips({ value, player, onSelect }: EffortChipsProps) {
  const { t } = useTranslation();
  return (
    <div
      role="group"
      aria-label={t('sessions.effort.group', { player })}
      className="flex flex-col gap-1.5"
    >
      <span className="text-[13px] font-semibold text-ink-soft">{t('sessions.effort.label')}</span>
      <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-10">
        {RATINGS.map((rating) => (
          <button
            key={rating}
            type="button"
            aria-pressed={value === rating}
            aria-label={t('sessions.effort.rate', { rating, player })}
            onClick={() => {
              onSelect(rating);
            }}
            className={cx(
              'min-h-11 rounded-control border text-[15px] font-semibold tabular-nums',
              'transition-[transform,background-color,border-color,color] duration-120 ease-touch active:scale-[0.96]',
              value === rating
                ? 'border-ink bg-ink text-on-ink'
                : 'border-line bg-raised text-ink hover:border-mute hover:bg-mute-soft',
            )}
          >
            {rating}
          </button>
        ))}
      </div>
      <div className="flex justify-between text-[13px] text-ink-soft">
        <span>{t('sessions.effort.easy')}</span>
        <span>{t('sessions.effort.maximal')}</span>
      </div>
      <p className="text-[13px] text-ink-soft">{t('sessions.effort.helper')}</p>
    </div>
  );
}

export interface PlayerRowProps {
  readonly sessionId: string;
  readonly skill: string;
  readonly player: Player;
  readonly attendance: AttendanceValue;
  readonly tally: Tally;
  readonly sessionMinutes: number;
}

/**
 * One player on the pitch: present or not, minutes, how hard it was, and how many times they
 * tried the session's skill. Every tap saves on its own; nothing waits for a Save button.
 */
export function PlayerRow({
  sessionId,
  skill,
  player,
  attendance,
  tally,
  sessionMinutes,
}: PlayerRowProps) {
  const { t } = useTranslation();
  const saveAttendance = useSaveAttendance(sessionId, player.id);
  const saveObservation = useSaveObservation(sessionId, skill, player.id);
  const name = player.label;
  const options: readonly SegmentedOption<AttendanceStatus>[] = [
    { value: 'present', label: t('sessions.attendance.present') },
    { value: 'absent', label: t('sessions.attendance.absent') },
  ];

  return (
    <Card as="li" className="flex flex-col gap-4">
      <div className="flex items-end gap-3">
        <span className="w-11 shrink-0 pb-1 text-center font-display text-[30px] tabular-nums">
          <span className="sr-only">{t('sessions.attendance.shirt')} </span>
          {player.shirt_number}
        </span>
        <div className="min-w-0 flex-1">
          <Segmented
            label={name}
            value={attendance.status}
            options={options}
            onChange={(status) => {
              saveAttendance.mutate(markStatus(attendance, status, sessionMinutes));
            }}
          />
        </div>
      </div>
      {attendance.status === 'present' && (
        <div className="flex flex-col gap-5 border-t border-line pt-4">
          <Stepper
            label={t('sessions.attendance.minutes')}
            value={attendance.minutes ?? sessionMinutes}
            min={0}
            max={MAX_MINUTES}
            step={5}
            suffix={t('sessions.attendance.minutesUnit')}
            decreaseLabel={t('sessions.attendance.minutesLess', { player: name })}
            increaseLabel={t('sessions.attendance.minutesMore', { player: name })}
            onChange={(minutes) => {
              saveAttendance.mutate(setMinutes(attendance, minutes));
            }}
          />
          <EffortChips
            value={attendance.rpe}
            player={name}
            onSelect={(rating) => {
              saveAttendance.mutate(toggleEffort(attendance, rating));
            }}
          />
          <div className="grid grid-cols-2 gap-4">
            <Stepper
              size="lg"
              label={t('sessions.counters.attempts')}
              value={tally.attempts}
              min={0}
              max={MAX_ATTEMPTS}
              decreaseLabel={t('sessions.counters.attemptsLess', { player: name })}
              increaseLabel={t('sessions.counters.attemptsMore', { player: name })}
              onChange={(attempts) => {
                saveObservation.mutate(setAttempts(tally, attempts));
              }}
            />
            <Stepper
              size="lg"
              label={t('sessions.counters.successes')}
              value={tally.successes}
              min={0}
              max={tally.attempts}
              decreaseLabel={t('sessions.counters.successesLess', { player: name })}
              increaseLabel={t('sessions.counters.successesMore', { player: name })}
              onChange={(successes) => {
                saveObservation.mutate(setSuccesses(tally, successes));
              }}
            />
          </div>
        </div>
      )}
    </Card>
  );
}
