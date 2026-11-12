import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../ui';
import { formatSeconds } from './format';

export interface Marks {
  readonly backswing: number;
  readonly strike: number;
  readonly follow: number | null;
}

export interface ScrubberProps {
  readonly times: readonly number[];
  readonly index: number;
  readonly onChange: (index: number) => void;
  readonly marks: Marks | null;
  /** Kicking-foot speed per frame, drawn as a faint trace behind the track. */
  readonly speeds: readonly number[] | null;
}

/** Slow motion: a strike lasts a handful of frames, so play at a quarter of real speed. */
const PLAYBACK_RATE = 0.25;

function tracePath(speeds: readonly number[]): string {
  const max = Math.max(...speeds, 1);
  const last = Math.max(1, speeds.length - 1);
  return speeds
    .map(
      (v, i) =>
        `${i === 0 ? 'M' : 'L'}${((i / last) * 100).toFixed(2)},${(40 - (v / max) * 36).toFixed(2)}`,
    )
    .join(' ');
}

/** Frame-by-frame control of the clip with the strike, backswing and follow-through marked. */
export function Scrubber({ times, index, onChange, marks, speeds }: ScrubberProps) {
  const { t, i18n } = useTranslation();
  const id = useId();
  const [playing, setPlaying] = useState(false);
  const last = times.length - 1;
  const position = useRef(index);
  useEffect(() => {
    position.current = index;
  }, [index]);

  useEffect(() => {
    if (!playing) return undefined;
    let raf = 0;
    let previous: number | null = null;
    let clock = times[position.current] ?? 0;
    const step = (now: number) => {
      clock += previous === null ? 0 : ((now - previous) / 1000) * PLAYBACK_RATE;
      previous = now;
      const next = times.findIndex((time) => time >= clock);
      if (next === -1 || next >= last) {
        onChange(last);
        setPlaying(false);
        return;
      }
      if (next !== position.current) onChange(next);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [last, onChange, playing, times]);

  const go = (next: number) => {
    setPlaying(false);
    onChange(Math.max(0, Math.min(last, next)));
  };
  const at = (frame: number) => `${((frame / Math.max(1, last)) * 100).toFixed(2)}%`;
  const time = formatSeconds(times[index] ?? 0, i18n.language);

  return (
    <div className="flex flex-col gap-3">
      <div className="relative pt-1">
        {speeds !== null && (
          <svg
            viewBox="0 0 100 40"
            preserveAspectRatio="none"
            aria-hidden="true"
            className="absolute inset-x-0 top-0 h-10 w-full"
          >
            <path
              d={tracePath(speeds)}
              fill="none"
              vectorEffect="non-scaling-stroke"
              className="stroke-mute"
              strokeWidth={1.5}
            />
          </svg>
        )}
        {marks !== null && (
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-10">
            <span
              className="absolute top-0 h-10 w-0.5 bg-amber"
              style={{ left: at(marks.backswing) }}
            />
            <span
              className="absolute top-0 h-10 w-1 -translate-x-1/4 rounded-full bg-pitch"
              style={{ left: at(marks.strike) }}
            />
            {marks.follow !== null && (
              <span
                className="absolute top-0 h-10 w-0.5 bg-home"
                style={{ left: at(marks.follow) }}
              />
            )}
          </div>
        )}
        <label htmlFor={id} className="sr-only">
          {t('shotlab.scrub.label')}
        </label>
        <input
          id={id}
          type="range"
          min={0}
          max={last}
          step={1}
          value={index}
          aria-valuetext={t('shotlab.scrub.valueText', { frame: index + 1, total: last + 1, time })}
          onChange={(event) => {
            go(Number(event.currentTarget.value));
          }}
          className="relative mt-8 h-11 w-full cursor-pointer accent-pitch"
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button
            variant="secondary"
            aria-label={t('shotlab.scrub.previous')}
            icon={<ChevronLeft />}
            onClick={() => {
              go(index - 1);
            }}
            disabled={index <= 0}
          />
          <Button
            variant="secondary"
            aria-pressed={playing}
            icon={playing ? <Pause /> : <Play />}
            onClick={() => {
              if (!playing && index >= last) onChange(0);
              setPlaying(!playing);
            }}
          >
            {t(playing ? 'shotlab.scrub.pause' : 'shotlab.scrub.play')}
          </Button>
          <Button
            variant="secondary"
            aria-label={t('shotlab.scrub.next')}
            icon={<ChevronRight />}
            onClick={() => {
              go(index + 1);
            }}
            disabled={index >= last}
          />
        </div>
        <p className="text-[13px] font-semibold text-ink-soft tabular-nums" aria-hidden="true">
          {t('shotlab.scrub.position', { frame: index + 1, total: last + 1, time })}
        </p>
      </div>
      {marks !== null && (
        <div
          role="group"
          aria-label={t('shotlab.scrub.jumpLabel')}
          className="grid grid-cols-3 gap-2"
        >
          <Button
            variant="ghost"
            onClick={() => {
              go(marks.backswing);
            }}
          >
            <span aria-hidden="true" className="size-2.5 rounded-full bg-amber" />
            {t('shotlab.scrub.backswing')}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              go(marks.strike);
            }}
          >
            <span aria-hidden="true" className="size-2.5 rounded-full bg-pitch" />
            {t('shotlab.scrub.strike')}
          </Button>
          <Button
            variant="ghost"
            disabled={marks.follow === null}
            onClick={() => {
              if (marks.follow !== null) go(marks.follow);
            }}
          >
            <span aria-hidden="true" className="size-2.5 rounded-full bg-home" />
            {t('shotlab.scrub.follow')}
          </Button>
        </div>
      )}
    </div>
  );
}
