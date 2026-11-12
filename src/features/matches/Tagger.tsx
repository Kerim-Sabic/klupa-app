import { FileBarChart } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import type { Side } from '../../engine';
import { useActiveClub } from '../../lib/club';
import type { MatchSummary } from '../../lib/data';
import { LinkButton, PageHeader, Stage, useToast } from '../../ui';
import { canRecord, formatClock, secondsAt, clockPhase, type ClockPhase } from './clock';
import { ClockControls } from './ClockControls';
import { EventFeed, FailedList } from './EventFeed';
import { EventPad, type DisabledReason } from './EventPad';
import { mergeFeed, recentEvents, type FeedEvent } from './feed';
import { carryOver, lineupPeriod } from './lineup';
import { LineupSheet } from './LineupSheet';
import type { EventInsert, EventRow, StintRow } from './model';
import { failedFor, pendingFor } from './outbox';
import { canTransition, statusAfter } from './status';
import { Scoreboard } from './Scoreboard';
import { scoreOf } from './score';
import { ShotSheet, type ShotDetails } from './ShotSheet';
import { useClock, useNow } from './useClock';
import { useLineup } from './useLineup';
import { useOutbox } from './useOutbox';
import { eventWeight, isShotKind, type EventKind, type ShotKind } from './weights';

export interface TaggerProps {
  readonly match: MatchSummary;
  readonly events: readonly EventRow[];
  readonly stints: readonly StintRow[];
}

interface ClockMoment {
  readonly period: number;
  readonly seconds: number;
}

interface PendingShot {
  readonly key: string;
  readonly kind: ShotKind;
  readonly side: Side;
  /** The moment of the tap, not of the save: placing the marker takes a few seconds. */
  readonly at: ClockMoment;
}

const CONFIRM_MS = 900;

function disabledReason(finished: boolean, phase: ClockPhase): DisabledReason | null {
  if (finished) return 'finished';
  return canRecord(phase) ? null : phase;
}

function vibrate(): void {
  if ('vibrate' in navigator) navigator.vibrate(10);
}

/** The live tagger for one loaded match. */
export function Tagger({ match, events, stints }: TaggerProps) {
  const { t } = useTranslation();
  const { clubId } = useActiveClub();
  const navigate = useNavigate();
  const { toast } = useToast();
  const outbox = useOutbox();
  const [clock, dispatch] = useClock(match.id, match.period_count);
  const phase = clockPhase(clock, match.period_count);
  const seconds = secondsAt(clock, useNow(clock.running));
  const lineup = useLineup(match.id, stints);
  const [side, setSide] = useState<Side>('home');
  const [shot, setShot] = useState<PendingShot | null>(null);
  const [shotOpen, setShotOpen] = useState(false);
  const [lineupOpen, setLineupOpen] = useState(false);
  const [confirmed, setConfirmed] = useState<EventKind | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const confirmTimer = useRef<number | undefined>(undefined);

  useEffect(
    () => () => {
      window.clearTimeout(confirmTimer.current);
    },
    [],
  );

  const feed = useMemo(
    () => mergeFeed(events, outbox.queue, match.id),
    [events, outbox.queue, match.id],
  );
  const pending = pendingFor(outbox.queue, match.id);
  // Where the match will be once the moves still waiting on this phone have been sent.
  const status = statusAfter(
    match.status,
    pending.flatMap((item) => (item.op.kind === 'status' ? [item.op.status] : [])),
  );
  const finished = status === 'finished';
  const disabled = disabledReason(finished, phase);

  function queueStatus(next: 'live' | 'finished') {
    // Only a move the database will accept is queued (see status.ts).
    if (!canTransition(status, next)) return;
    outbox.add({
      id: crypto.randomUUID(),
      matchId: match.id,
      recordedAt: new Date().toISOString(),
      op: { kind: 'status', clubId, matchId: match.id, status: next },
    });
  }

  function record(kind: EventKind, eventSide: Side, at: ClockMoment, details?: ShotDetails) {
    const location = details?.location ?? null;
    const header = details?.header ?? false;
    const row: EventInsert = {
      client_id: crypto.randomUUID(),
      club_id: clubId,
      match_id: match.id,
      period: at.period,
      clock_seconds: at.seconds,
      side: eventSide,
      kind,
      weight: eventWeight({ kind, location, header, freeKick: details?.freeKick ?? false }),
      x: location?.x ?? null,
      y: location?.y ?? null,
      header,
    };
    outbox.add({
      id: row.client_id,
      matchId: match.id,
      recordedAt: new Date().toISOString(),
      op: { kind: 'event', row },
    });
    void outbox.flushNow();
    vibrate();
    setConfirmed(kind);
    window.clearTimeout(confirmTimer.current);
    confirmTimer.current = window.setTimeout(() => {
      setConfirmed(null);
    }, CONFIRM_MS);
    setAnnouncement(
      t('matches.pad.recorded', {
        kind: t(`matches.kinds.${kind}`),
        side: t(`matches.side.${eventSide}`),
        clock: formatClock(at.seconds),
      }),
    );
  }

  function tap(kind: EventKind) {
    const at = { period: clock.period, seconds: secondsAt(clock, Date.now()) };
    if (isShotKind(kind)) {
      setShot({ key: crypto.randomUUID(), kind, side, at });
      setShotOpen(true);
    } else {
      record(kind, side, at);
    }
  }

  function undo(event: FeedEvent) {
    if (event.sync === 'failed') {
      outbox.dismiss(event.client_id);
    } else {
      outbox.add({
        id: crypto.randomUUID(),
        matchId: match.id,
        recordedAt: new Date().toISOString(),
        op: {
          kind: 'undo',
          clubId,
          matchId: match.id,
          clientId: event.client_id,
          deletedAt: new Date().toISOString(),
        },
      });
      void outbox.flushNow();
    }
    setAnnouncement(t('matches.feed.undone'));
  }

  function start() {
    dispatch('start');
    if (match.status === 'scheduled') {
      queueStatus('live');
      void outbox.flushNow();
    }
  }

  function endPeriod() {
    const ended = dispatch('end');
    return lineup.closeAll(ended.period, secondsAt(ended, Date.now()));
  }

  function nextPeriod() {
    const previous = clock.period;
    const endSeconds = secondsAt(clock, Date.now());
    const next = dispatch('next');
    if (next.period === previous + 1) {
      void lineup.reopen(carryOver(stints, previous, endSeconds), next.period);
    }
  }

  async function finish() {
    if (phase === 'running' || phase === 'paused') await endPeriod();
    queueStatus('finished');
    await outbox.flushNow();
    if (pendingFor(outbox.peek(), match.id).length === 0) {
      void navigate(`/matches/${match.id}`);
    } else {
      toast({ tone: 'info', message: t('matches.sync.savedLocally') });
    }
  }

  const editPeriod = finished ? null : lineupPeriod(phase, clock.period);

  return (
    <>
      <PageHeader
        compact
        title={t('matches.tagger.title', { opponent: match.opponent })}
        back={{ to: '/matches', label: t('matches.tagger.back') }}
      />
      {/* Score, clock, controls and all eight buttons fit one phone screen: nothing sticks,
          nothing overlaps, and the history sits below for when there is time to look. */}
      <div className="flex flex-col gap-3 md:gap-4">
        <Stage className="flex flex-col gap-3 p-4 md:gap-4 md:p-5">
          <Scoreboard
            opponent={match.opponent}
            score={scoreOf(feed)}
            period={clock.period}
            periodCount={match.period_count}
            phase={phase}
            seconds={seconds}
            waiting={pending.length}
            online={outbox.online}
          />
          {finished ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="font-semibold">{t('matches.tagger.finishedTitle')}</p>
              <LinkButton to={`/matches/${match.id}`} icon={<FileBarChart />}>
                {t('matches.tagger.openReview')}
              </LinkButton>
            </div>
          ) : (
            <ClockControls
              phase={phase}
              period={clock.period}
              onStart={start}
              onPause={() => dispatch('pause')}
              onResume={() => dispatch('resume')}
              onEnd={() => {
                void endPeriod();
              }}
              onNext={nextPeriod}
              onFinish={finish}
              onLineup={() => {
                setLineupOpen(true);
              }}
            />
          )}
        </Stage>
        <FailedList
          items={failedFor(outbox.queue, match.id)}
          onRetry={outbox.retry}
          onDismiss={outbox.dismiss}
        />
        <EventPad
          side={side}
          onSide={setSide}
          onTap={tap}
          disabled={disabled}
          confirmed={confirmed}
          announcement={announcement}
          last={recentEvents(feed, 1)[0]}
          onUndo={undo}
        />
        <EventFeed events={recentEvents(feed)} canUndo={!finished} onUndo={undo} />
      </div>
      {shot !== null && (
        <ShotSheet
          key={shot.key}
          open={shotOpen}
          kind={shot.kind}
          onClose={() => {
            setShotOpen(false);
          }}
          onSave={(details) => {
            setShotOpen(false);
            record(shot.kind, shot.side, shot.at, details);
          }}
        />
      )}
      <LineupSheet
        open={lineupOpen}
        onClose={() => {
          setLineupOpen(false);
        }}
        stints={stints}
        period={editPeriod}
        clock={{ period: clock.period, seconds }}
        periodSeconds={match.period_minutes * 60}
        busy={lineup.busy}
        onToggle={(playerId) => {
          if (editPeriod === null) return;
          const at = phase === 'before' ? 0 : secondsAt(clock, Date.now());
          void lineup.toggle(playerId, editPeriod, at);
        }}
      />
    </>
  );
}
