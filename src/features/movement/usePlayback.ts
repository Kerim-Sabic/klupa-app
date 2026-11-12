import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { Tracking } from '../../engine/tracking';
import { advance, clampSeconds, periodDuration, type PlaybackSpeed } from './model';

export interface ClockTime {
  period: number;
  seconds: number;
}

/** How often React hears about the clock while playing: the readout, not the animation. */
export const PUBLISH_MS = 250;

export interface Playback {
  /** The exact clock, advanced every animation frame; read it in `useFrame`, never render from it. */
  readonly clock: RefObject<ClockTime>;
  /** The clock as React last heard it: a few times a second while playing, at once on a seek. */
  readonly time: Readonly<ClockTime>;
  readonly duration: number;
  readonly playing: boolean;
  readonly speed: PlaybackSpeed;
  readonly toggle: () => void;
  readonly pause: () => void;
  readonly seek: (seconds: number) => void;
  readonly step: (delta: number) => void;
  readonly setPeriod: (period: number) => void;
  readonly setSpeed: (speed: PlaybackSpeed) => void;
}

/**
 * One clock for the whole replay. A requestAnimationFrame loop moves the ref on smoothly;
 * React state follows at `PUBLISH_MS`, so nothing re-renders per frame.
 */
export function usePlayback(tracking: Tracking): Playback {
  const clock = useRef<ClockTime>({ period: 1, seconds: 0 });
  const [time, setTime] = useState<ClockTime>({ period: 1, seconds: 0 });
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<PlaybackSpeed>('1');
  const duration = periodDuration(tracking, time.period);

  const publish = useCallback(() => {
    setTime({ ...clock.current });
  }, []);

  const seek = useCallback(
    (seconds: number) => {
      const current = clock.current;
      current.seconds = clampSeconds(seconds, periodDuration(tracking, current.period));
      publish();
    },
    [publish, tracking],
  );

  const step = useCallback(
    (delta: number) => {
      seek(clock.current.seconds + delta);
    },
    [seek],
  );

  const setPeriod = useCallback(
    (period: number) => {
      clock.current = { period, seconds: 0 };
      publish();
    },
    [publish],
  );

  const toggle = useCallback(() => {
    if (!playing && clock.current.seconds >= periodDuration(tracking, clock.current.period)) {
      seek(0);
    }
    setPlaying(!playing);
  }, [playing, seek, tracking]);

  const pause = useCallback(() => {
    setPlaying(false);
  }, []);

  useEffect(() => {
    if (!playing) return undefined;
    let raf = 0;
    let previous: number | null = null;
    let lastPublish = -Infinity;
    const rate = Number(speed);
    const tick = (now: number) => {
      const current = clock.current;
      const next = advance(
        current.seconds,
        previous === null ? 0 : now - previous,
        rate,
        periodDuration(tracking, current.period),
      );
      previous = now;
      current.seconds = next.seconds;
      if (next.ended) {
        publish();
        setPlaying(false);
        return;
      }
      if (now - lastPublish >= PUBLISH_MS) {
        lastPublish = now;
        publish();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      publish();
    };
  }, [playing, publish, speed, tracking]);

  return {
    clock,
    time,
    duration,
    playing,
    speed,
    toggle,
    pause,
    seek,
    step,
    setPeriod,
    setSpeed,
  };
}
