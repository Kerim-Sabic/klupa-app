/*
 * How fast the app felt on a real phone, as three numbers per page load:
 *
 *   lcp  when the largest thing on screen appeared, in milliseconds
 *   inp  how slow the slowest tap or key press was to show a result, in milliseconds
 *   cls  how far the layout jumped without being asked, as the worst burst times 1,000
 *
 * One sample is sent per page load: when the page is first hidden, or after twenty seconds,
 * whichever comes first. It carries the route with ids replaced and the release, and nothing
 * about the person or the device. Browsers that cannot measure a number leave it out; a
 * browser that can measure none sends nothing. Sampling never throws.
 */
import { scrub } from './report';

export interface VitalsSample {
  readonly route: string;
  readonly release: string;
  readonly lcp: number | null;
  readonly inp: number | null;
  readonly cls: number | null;
}

export interface LayoutShift {
  readonly startTime: number;
  readonly value: number;
  readonly hadRecentInput: boolean;
}

const BURST_GAP_MS = 1000;
const BURST_LIMIT_MS = 5000;

/**
 * The largest burst of unexpected layout movement: shifts less than a second apart, in a
 * window of at most five seconds, added up. Shifts right after a tap are the page answering
 * the person and do not count.
 */
export function largestShiftBurst(shifts: readonly LayoutShift[]): number {
  let worst = 0;
  let burst = 0;
  let burstStart = 0;
  let previous = Number.NEGATIVE_INFINITY;
  for (const shift of shifts) {
    if (shift.hadRecentInput) continue;
    const continues =
      shift.startTime - previous < BURST_GAP_MS && shift.startTime - burstStart < BURST_LIMIT_MS;
    if (!continues) {
      burst = 0;
      burstStart = shift.startTime;
    }
    burst += shift.value;
    previous = shift.startTime;
    worst = Math.max(worst, burst);
  }
  return worst;
}

/**
 * The slowest interaction, ignoring one outlier for every fifty: with fewer than fifty taps it
 * is simply the slowest. Null when nobody has tapped anything.
 */
export function slowestInteraction(durations: readonly number[]): number | null {
  if (durations.length === 0) return null;
  const slowestFirst = [...durations].sort((a, b) => b - a);
  return slowestFirst[Math.floor(durations.length / 50)] ?? null;
}

interface Entry {
  readonly startTime: number;
  readonly duration: number;
  readonly value?: number;
  readonly hadRecentInput?: boolean;
  readonly interactionId?: number;
}

interface ObserverLike {
  observe: (options: { type: string; buffered: boolean; durationThreshold?: number }) => void;
  disconnect: () => void;
}
export type ObserverClass = new (
  callback: (list: { getEntries: () => readonly Entry[] }) => void,
) => ObserverLike;

interface PageTarget {
  addEventListener: (type: string, listener: () => void) => void;
  removeEventListener: (type: string, listener: () => void) => void;
}

export interface VitalsOptions {
  /** Files one sample. Rejections are swallowed. */
  readonly send: (sample: VitalsSample) => Promise<void>;
  /** False when sampling is switched off for this build. */
  readonly enabled: boolean;
  readonly release: string;
  readonly pathname: () => string;
  readonly page: PageTarget;
  readonly isHidden: () => boolean;
  /** The browser's PerformanceObserver, or undefined where there is none. */
  readonly Observer: ObserverClass | undefined;
  readonly setTimer?: (run: () => void, ms: number) => unknown;
}

export const SEND_AFTER_MS = 20_000;

/** Starts measuring this page load. Returns the function that stops it. */
export function installVitals(options: VitalsOptions): () => void {
  const { Observer } = options;
  if (!options.enabled || Observer === undefined) return () => undefined;

  let lcp: number | null = null;
  const shifts: LayoutShift[] = [];
  const interactions = new Map<number, number>();
  const observers: ObserverLike[] = [];
  let measuresLayout = false;

  const watch = (type: string, read: (entry: Entry) => void, durationThreshold?: number) => {
    try {
      const observer = new Observer((list) => {
        list.getEntries().forEach(read);
      });
      observer.observe({
        type,
        buffered: true,
        ...(durationThreshold !== undefined && { durationThreshold }),
      });
      observers.push(observer);
      return true;
    } catch {
      // This browser does not report this kind of entry: that number is simply left out.
      return false;
    }
  };

  watch('largest-contentful-paint', (entry) => {
    lcp = entry.startTime;
  });
  measuresLayout = watch('layout-shift', (entry) => {
    shifts.push({
      startTime: entry.startTime,
      value: entry.value ?? 0,
      hadRecentInput: entry.hadRecentInput === true,
    });
  });
  watch(
    'event',
    (entry) => {
      const id = entry.interactionId ?? 0;
      // One tap produces several events; the interaction is as slow as its slowest event.
      if (id > 0) interactions.set(id, Math.max(interactions.get(id) ?? 0, entry.duration));
    },
    40,
  );

  let sent = false;
  const sendOnce = () => {
    if (sent) return;
    sent = true;
    observers.forEach((observer) => {
      observer.disconnect();
    });
    const inp = slowestInteraction([...interactions.values()]);
    const sample: VitalsSample = {
      route: scrub(options.pathname(), 120),
      release: options.release,
      lcp: lcp === null ? null : Math.round(lcp),
      inp: inp === null ? null : Math.round(inp),
      cls: measuresLayout ? Math.round(largestShiftBurst(shifts) * 1000) : null,
    };
    if (sample.lcp === null && sample.inp === null && sample.cls === null) return;
    options.send(sample).catch(() => {
      // Deliberately silent: a measurement that could not be filed is not worth an error.
    });
  };

  const onVisibility = () => {
    if (options.isHidden()) sendOnce();
  };
  options.page.addEventListener('visibilitychange', onVisibility);
  options.page.addEventListener('pagehide', sendOnce);
  (options.setTimer ?? setTimeout)(sendOnce, SEND_AFTER_MS);

  return () => {
    sent = true;
    options.page.removeEventListener('visibilitychange', onVisibility);
    options.page.removeEventListener('pagehide', sendOnce);
    observers.forEach((observer) => {
      observer.disconnect();
    });
  };
}
