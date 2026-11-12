import { Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { usePlayers } from '../../lib/data';
import { EmptyState, ErrorNotice, Pill, Sheet, SkeletonText, Spinner } from '../../ui';
import { lineupEntries, type ClockReading, type LineupEntry } from './lineup';
import type { StintRow } from './model';

export interface LineupSheetProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly stints: readonly StintRow[];
  /** The period being edited, or null while the lineup is closed (between periods). */
  readonly period: number | null;
  readonly clock: ClockReading;
  readonly periodSeconds: number;
  readonly busy: ReadonlySet<string>;
  readonly onToggle: (playerId: string) => void;
}

function PlayerRow({
  entry,
  disabled,
  busy,
  onToggle,
}: {
  entry: LineupEntry;
  disabled: boolean;
  busy: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const { player } = entry;
  return (
    <li className="flex items-center gap-3 py-2">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-mute-soft font-display text-[17px]">
        {player.shirt_number}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{player.label}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[13px] text-ink-soft">
          {entry.notPlayed ? (
            <Pill tone="amber">{t('matches.lineup.notPlayed')}</Pill>
          ) : (
            <span>{t('matches.lineup.minutes', { minutes: Math.floor(entry.seconds / 60) })}</span>
          )}
        </div>
      </div>
      {busy && <Spinner />}
      <button
        type="button"
        role="switch"
        aria-checked={entry.on}
        aria-label={t('matches.lineup.toggle', {
          label: player.label,
          number: player.shirt_number,
        })}
        disabled={disabled || busy}
        onClick={onToggle}
        className="relative h-11 w-16 shrink-0 rounded-full transition-transform duration-120 ease-touch active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
      >
        <span
          aria-hidden="true"
          className={`absolute inset-x-1 inset-y-2 rounded-full transition-colors duration-120 ${entry.on ? 'bg-pitch' : 'bg-mute-soft border border-line'}`}
        />
        <span
          aria-hidden="true"
          className={`absolute top-3 size-5 rounded-full bg-raised shadow-float transition-[left] duration-120 ease-touch ${entry.on ? 'left-9' : 'left-2'}`}
        />
      </button>
    </li>
  );
}

/**
 * Who is on the pitch, with minutes so far. Players who have not played yet are listed first
 * and marked, so sharing minutes fairly takes one look.
 */
export function LineupSheet(props: LineupSheetProps) {
  const { open, onClose, stints, period, clock, periodSeconds, busy, onToggle } = props;
  const { t } = useTranslation();
  const players = usePlayers();

  let body;
  if (players.isPending) {
    body = <SkeletonText lines={6} />;
  } else if (players.isError) {
    body = (
      <ErrorNotice
        title={t('matches.lineup.loadError')}
        onRetry={() => {
          void players.refetch();
        }}
      />
    );
  } else if (players.data.length === 0) {
    body = (
      <EmptyState
        icon={<Users />}
        title={t('matches.lineup.emptyTitle')}
        body={t('matches.lineup.emptyBody')}
      />
    );
  } else {
    const entries = lineupEntries(players.data, stints, clock, periodSeconds, period);
    const onCount = entries.filter((entry) => entry.on).length;
    body = (
      <>
        <p className="text-[15px] text-ink-soft">
          {period === null
            ? t('matches.lineup.closed')
            : clock.period === 0
              ? t('matches.lineup.before')
              : t('matches.lineup.onCount', { n: onCount })}
        </p>
        <ul className="mt-2 divide-y divide-line">
          {entries.map((entry) => (
            <PlayerRow
              key={entry.player.id}
              entry={entry}
              disabled={period === null}
              busy={busy.has(entry.player.id)}
              onToggle={() => {
                onToggle(entry.player.id);
              }}
            />
          ))}
        </ul>
      </>
    );
  }

  return (
    <Sheet open={open} onClose={onClose} title={t('matches.lineup.title')}>
      {body}
    </Sheet>
  );
}
