import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { demoMatches } from '../../data/dfl';
import { playerPath, type Tracking } from '../../engine/tracking';
import { Card } from '../../ui';
import { formatPercent } from './format';
import { LayerPanel, type Layers } from './LayerPanel';
import {
  distanceTable,
  readReplay,
  shotMarks,
  STEP_SECONDS,
  TRAIL_SECONDS,
  type Leader,
} from './model';
import { ReadoutPanel } from './ReadoutPanel';
import { Stage } from './Stage';
import type { MatchEntry } from './matches';
import { clubsOf } from './matches';
import { Transport } from './Transport';
import { usePlayback } from './usePlayback';

/** The shots of the same match from its event file, whose "home" is the tracking file's "home". */
export function shotsOf(id: string) {
  return demoMatches.find((match) => match.id === `DFL-MAT-${id}`)?.events ?? [];
}

/** While playing, the live line speaks at most this often, unless the side in control changes. */
const LIVE_EVERY_MS = 15_000;
const LIVE_CHANGE_MS = 5_000;

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName) ||
    target.isContentEditable ||
    target.closest('[role="radiogroup"]') !== null
  );
}

/** The replay once the match is loaded: picture, transport, layers and the numbers. */
export function Replay({
  tracking,
  match,
}: {
  readonly tracking: Tracking;
  readonly match: MatchEntry;
}) {
  const { t, i18n } = useTranslation();
  const playback = usePlayback(tracking);
  const { time, toggle, step, playing } = playback;
  const [layers, setLayers] = useState<Layers>({ shape: true, space: false, trail: true });
  const [selected, setSelected] = useState<number | null>(null);

  const distances = useMemo(
    () => (selected === null ? null : distanceTable(tracking, selected, time.period)),
    [tracking, selected, time.period],
  );
  const readout = useMemo(
    () => readReplay(tracking, time.period, time.seconds, selected, distances),
    [tracking, time.period, time.seconds, selected, distances],
  );
  const trail = useMemo(() => {
    if (selected === null || !layers.trail) return [];
    const from = Math.max(0, readout.frame.seconds - TRAIL_SECONDS);
    return playerPath(tracking, selected, time.period, from, readout.frame.seconds);
  }, [tracking, selected, layers.trail, time.period, readout.frame.seconds]);
  const clubs = useMemo(() => clubsOf(match), [match]);
  const marks = useMemo(
    () => shotMarks(shotsOf(match.id), time.period, playback.duration),
    [match.id, time.period, playback.duration],
  );
  const half = t(`movement.transport.period${String(time.period)}`);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      if (isTyping(event.target)) return;
      if (event.key === ' ') {
        // A focused button already answers Space itself.
        if (event.target instanceof HTMLButtonElement) return;
        event.preventDefault();
        toggle();
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        step(event.key === 'ArrowLeft' ? -STEP_SECONDS : STEP_SECONDS);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [toggle, step]);

  const liveText = (leader: Leader | null) => {
    const share = readout.homeShare ?? 0.5;
    const key = leader === null ? 'level' : leader;
    return t(`movement.live.${key}`, {
      clock: readout.clock,
      half,
      club: key === 'level' ? '' : clubs[key],
      share: formatPercent(key === 'away' ? 1 - share : share, i18n.language),
    });
  };
  const text = liveText(readout.leader);
  const [live, setLive] = useState(text);
  const spoken = useRef<{ at: number; leader: Leader | null }>({ at: 0, leader: null });
  useEffect(() => {
    const now = performance.now();
    const last = spoken.current;
    const changed = readout.leader !== last.leader;
    const due =
      !playing || now - last.at >= LIVE_EVERY_MS || (changed && now - last.at >= LIVE_CHANGE_MS);
    if (!due) return;
    spoken.current = { at: now, leader: readout.leader };
    setLive(text);
  }, [text, playing, readout.leader]);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex min-w-0 flex-col gap-4">
        <Stage
          tracking={tracking}
          playback={playback}
          readout={readout}
          layers={layers}
          selected={selected}
          onSelect={setSelected}
          trail={trail}
        />
        <p
          aria-live="polite"
          data-testid="live-line"
          className="rounded-control bg-mute-soft px-3 py-2 text-[15px] text-ink tabular-nums"
        >
          {live}
        </p>
        <Card as="section" aria-label={t('movement.transport.scrubLabel')}>
          <Transport playback={playback} marks={marks} periods={tracking.meta.periods.length} />
        </Card>
      </div>
      <div className="flex min-w-0 flex-col gap-4">
        <ReadoutPanel readout={readout} half={half} />
        <LayerPanel
          layers={layers}
          onToggle={(key) => {
            setLayers((current) => ({ ...current, [key]: !current[key] }));
          }}
          roster={tracking.meta.roster}
          selected={selected}
          onSelect={setSelected}
        />
      </div>
    </div>
  );
}
