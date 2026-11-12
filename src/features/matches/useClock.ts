import { useCallback, useEffect, useRef, useState } from 'react';
import { clockReducer, loadClock, saveClock, type ClockAction, type ClockState } from './clock';

type ActionType = ClockAction['type'];

/**
 * The persisted clock of one match. Every change is written to localStorage at once, so a
 * reload or a dead battery at the touchline loses nothing. Returns the state the dispatch
 * produced, so callers can act on the exact second a period ended.
 */
export function useClock(
  matchId: string,
  periodCount: number,
): [ClockState, (type: ActionType, now?: number) => ClockState] {
  const [state, setState] = useState<ClockState>(() => loadClock(matchId));
  // The ref is the source of truth between renders, so two quick taps never act on a stale state.
  const latest = useRef(state);

  const dispatch = useCallback(
    (type: ActionType, now: number = Date.now()): ClockState => {
      const action: ClockAction = type === 'next' ? { type, now, periodCount } : { type, now };
      const current = latest.current;
      const next = clockReducer(current, action);
      if (next === current) return current;
      latest.current = next;
      saveClock(matchId, next);
      setState(next);
      return next;
    },
    [matchId, periodCount],
  );

  return [state, dispatch];
}

/** The current time, ticking while `active` so a running clock repaints. */
export function useNow(active: boolean, intervalMs = 250): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, intervalMs);
    return () => {
      window.clearInterval(timer);
    };
  }, [active, intervalMs]);
  return now;
}
