import { useCallback, useState } from 'react';

interface TargetState<T> {
  readonly key: number;
  readonly value: T | null;
  readonly open: boolean;
}

export interface Target<T> {
  /** Changes every time the sheet opens, so its form starts fresh without an effect. */
  readonly key: number;
  readonly value: T | null;
  readonly open: boolean;
  readonly show: (value: T | null) => void;
  readonly hide: () => void;
}

/**
 * What a sheet is about, and whether it is open. Closing keeps the value so the sheet can
 * finish its exit animation with its content intact.
 */
export function useTarget<T>(): Target<T> {
  const [state, setState] = useState<TargetState<T>>({ key: 0, value: null, open: false });
  const show = useCallback((value: T | null) => {
    setState((current) => ({ key: current.key + 1, value, open: true }));
  }, []);
  const hide = useCallback(() => {
    setState((current) => ({ ...current, open: false }));
  }, []);
  return { key: state.key, value: state.value, open: state.open, show, hide };
}
