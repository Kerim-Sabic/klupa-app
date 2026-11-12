import { useCallback, useEffect, useState } from 'react';
import { decodeTracking, parseTrackingMeta, type Tracking } from '../../engine/tracking';
import {
  binUrl,
  INDEX_URL,
  metaUrl,
  parseMatchIndex,
  physicalUrl,
  type MatchEntry,
} from './matches';
import { parsePhysical, type PhysicalReport } from './physical';

export type Loaded<T> =
  | { readonly phase: 'loading'; readonly loaded: number; readonly total: number }
  | { readonly phase: 'error' }
  | { readonly phase: 'ready'; readonly value: T };

type Progress = (loaded: number, total: number) => void;

/** Read a response body chunk by chunk so the coach sees real download progress. */
async function readBytes(
  response: Response,
  expected: number,
  onProgress: Progress,
): Promise<ArrayBuffer> {
  const total = Number(response.headers.get('content-length')) || expected;
  if (response.body === null) {
    const whole = await response.arrayBuffer();
    onProgress(whole.byteLength, whole.byteLength);
    return whole;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress(loaded, Math.max(total, loaded));
  }
  const out = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out.buffer;
}

async function getJson(url: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Could not load ${url}.`);
  return response.json();
}

export async function loadIndex(signal: AbortSignal): Promise<readonly MatchEntry[]> {
  return parseMatchIndex(await getJson(INDEX_URL, signal));
}

/** One match's metadata (small, validated), then its positions with progress. */
export async function loadTracking(
  id: string,
  signal: AbortSignal,
  onProgress: Progress,
): Promise<Tracking> {
  const meta = parseTrackingMeta(await getJson(metaUrl(id), signal));
  onProgress(0, meta.bytes);
  const response = await fetch(binUrl(id), { signal });
  if (!response.ok) throw new Error(`Could not load ${binUrl(id)}.`);
  return decodeTracking(await readBytes(response, meta.bytes, onProgress), meta);
}

export async function loadPhysical(id: string, signal: AbortSignal): Promise<PhysicalReport> {
  return parsePhysical(await getJson(physicalUrl(id), signal));
}

/**
 * Run `load` when `key` changes (and again on retry), with progress, cancelling the previous
 * request. A null key loads nothing and stays in the loading state.
 */
export function useLoad<T>(
  key: string | null,
  load: (key: string, signal: AbortSignal, onProgress: Progress) => Promise<T>,
): { state: Loaded<T>; retry: () => void } {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<Loaded<T>>({ phase: 'loading', loaded: 0, total: 0 });
  const [current, setCurrent] = useState({ key, attempt });
  // A new match or a retry starts from an empty progress bar, in the same render.
  if (current.key !== key || current.attempt !== attempt) {
    setCurrent({ key, attempt });
    setState({ phase: 'loading', loaded: 0, total: 0 });
  }

  useEffect(() => {
    if (key === null) return undefined;
    const controller = new AbortController();
    const live = () => !controller.signal.aborted;
    load(key, controller.signal, (loaded, total) => {
      if (live()) setState({ phase: 'loading', loaded, total });
    }).then(
      (value) => {
        if (live()) setState({ phase: 'ready', value });
      },
      () => {
        if (live()) setState({ phase: 'error' });
      },
    );
    return () => {
      controller.abort();
    };
  }, [key, attempt, load]);

  const retry = useCallback(() => {
    setAttempt((n) => n + 1);
  }, []);

  return { state, retry };
}

const indexLoader = (_key: string, signal: AbortSignal) => loadIndex(signal);
const physicalLoader = (id: string, signal: AbortSignal) => loadPhysical(id, signal);

export const useMatchIndex = () => useLoad('index', indexLoader);
export const useTrackingData = (id: string | null) => useLoad(id, loadTracking);
export const usePhysical = (id: string) => useLoad(id, physicalLoader);
