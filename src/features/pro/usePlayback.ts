import { useCallback, useEffect, useRef, useState } from 'react';
import {
  PUBLISH_MS,
  initialPlayback,
  playbackReducer,
  type PlaybackAction,
  type PlaybackState,
} from './playback';

/** A frame longer than this (a throttled tab, a debugger) is treated as this long. */
const MAX_FRAME_MS = 250;

/**
 * The transport. The running clock lives in a ref and advances every animation frame; React
 * hears about it at most every `PUBLISH_MS`, so a phone redraws the charts four times a
 * second instead of sixty. Hiding the tab pauses playback.
 */
export function usePlayback(total: number): {
  readonly state: PlaybackState;
  readonly dispatch: (action: PlaybackAction) => void;
} {
  const [state, setState] = useState(() => initialPlayback(total));
  const clock = useRef(state);

  const dispatch = useCallback((action: PlaybackAction) => {
    clock.current = playbackReducer(clock.current, action);
    setState(clock.current);
  }, []);

  useEffect(() => {
    if (!state.playing) return;
    let frame = 0;
    let last: number | null = null;
    let published = 0;
    const loop = (now: number) => {
      const ms = last === null ? 0 : Math.min(now - last, MAX_FRAME_MS);
      last = now;
      clock.current = playbackReducer(clock.current, { type: 'tick', ms });
      published += ms;
      if (!clock.current.playing || published >= PUBLISH_MS) {
        published = 0;
        setState(clock.current);
      }
      if (clock.current.playing) frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') dispatch({ type: 'pause' });
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [state.playing, dispatch]);

  return { state, dispatch };
}
