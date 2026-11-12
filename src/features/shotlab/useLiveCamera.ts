import { useCallback, useEffect, useRef, useState } from 'react';
import type { PoseFrame } from '../../engine/pose';
import type { ImagePoint, LoadProgress, PoseDetector } from './detector';
import {
  catchStrike,
  emptyRing,
  frameNumbers,
  framesPerSecond,
  idleScheduler,
  isTooSlow,
  isTracking,
  NO_NUMBERS,
  pushFrame,
  recentCompletions,
  shouldInfer,
  smoothNumbers,
  type CaughtStrike,
  type LiveNumbers,
} from './liveModel';

export type LiveError = 'denied' | 'no-camera' | 'in-use' | 'model' | 'unknown';
export type Facing = 'environment' | 'user';

export type LiveStatus =
  | { readonly kind: 'idle' }
  | { readonly kind: 'starting'; readonly loaded: number; readonly total: number }
  | { readonly kind: 'running' }
  | { readonly kind: 'hidden' }
  | { readonly kind: 'error'; readonly reason: LiveError };

export interface LiveReading {
  readonly tracking: boolean;
  readonly fps: number;
  readonly numbers: LiveNumbers;
  readonly tooSlow: boolean;
}

export type GetDetector = (
  signal: AbortSignal,
  onProgress: (progress: LoadProgress) => void,
) => Promise<PoseDetector>;

/** How often the readout and the strike search run, in milliseconds (about ten a second). */
export const PUBLISH_MS = 100;
/** The first seconds include model warm-up, so they do not count towards "too slow". */
const WARM_UP_MS = 2000;

const START_READING: LiveReading = { tracking: false, fps: 0, numbers: NO_NUMBERS, tooSlow: false };

/** Map a getUserMedia failure to something a coach can act on. */
export function cameraError(error: unknown): LiveError {
  // A DOMException is not an Error in every engine; read its name either way.
  const name =
    typeof error === 'object' && error !== null && 'name' in error ? String(error.name) : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'no-camera';
  if (name === 'NotReadableError' || name === 'AbortError') return 'in-use';
  return 'unknown';
}

export function canUseCamera(): boolean {
  return 'mediaDevices' in navigator && typeof navigator.mediaDevices.getUserMedia === 'function';
}

/**
 * The live camera. The picture goes from the camera to a video element on this page and
 * from there to the pose model, also on this page. Nothing is recorded: only the last three
 * seconds of skeleton points are kept, in memory, to catch a strike.
 */
export function useLiveCamera(
  getDetector: GetDetector,
  draw: (image: readonly ImagePoint[] | null) => void,
) {
  const [status, setStatus] = useState<LiveStatus>({ kind: 'idle' });
  const [reading, setReading] = useState<LiveReading>(START_READING);
  const [caught, setCaught] = useState<CaughtStrike | null>(null);
  const [facing, setFacing] = useState<Facing>('environment');
  const facingRef = useRef<Facing>('environment');
  const [canSwitch, setCanSwitch] = useState(false);
  const video = useRef<HTMLVideoElement | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const run = useRef<AbortController | null>(null);
  const frame = useRef(0);
  const drawRef = useRef(draw);
  useEffect(() => {
    drawRef.current = draw;
  }, [draw]);

  const release = useCallback(() => {
    run.current?.abort();
    run.current = null;
    cancelAnimationFrame(frame.current);
    stream.current?.getTracks().forEach((track) => {
      track.stop();
    });
    stream.current = null;
    if (video.current !== null) video.current.srcObject = null;
  }, []);

  const loop = useCallback((detector: PoseDetector, signal: AbortSignal) => {
    const started = performance.now();
    let scheduler = idleScheduler;
    let ring = emptyRing();
    let previous: PoseFrame | undefined;
    let numbers = NO_NUMBERS;
    let tracking = false;
    let completions: number[] = [];
    let rates: [number, number][] = [];
    let published = 0;
    let lastCatch: CaughtStrike | null = null;
    detector.beginClip();
    const tick = () => {
      if (signal.aborted) return;
      frame.current = requestAnimationFrame(tick);
      const element = video.current;
      if (element === null || element.readyState < 2) return;
      if (!shouldInfer(scheduler, element.currentTime)) return;
      scheduler = { busy: true, lastVideoTime: element.currentTime };
      const now = performance.now();
      const detected = detector.detect(element, Math.round(now - started));
      scheduler = { ...scheduler, busy: false };
      const current: PoseFrame = {
        time: (now - started) / 1000,
        world: detected.world,
        people: detected.people ?? 0,
      };
      tracking = isTracking(current);
      numbers = smoothNumbers(numbers, frameNumbers(previous, current));
      previous = current;
      ring = pushFrame(ring, current);
      completions = recentCompletions(completions, now);
      drawRef.current(tracking ? detected.image : null);
      if (now - published < PUBLISH_MS) return;
      published = now;
      const fps = framesPerSecond(completions, now);
      if (now - started > WARM_UP_MS)
        rates = [...rates.filter(([t]) => t > now - 5000), [now, fps]];
      setReading({ tracking, fps, numbers, tooSlow: isTooSlow(rates, now) });
      const next = catchStrike(ring, lastCatch);
      if (next !== null) {
        lastCatch = next;
        setCaught(next);
      }
    };
    frame.current = requestAnimationFrame(tick);
  }, []);

  const start = useCallback(
    async (choice?: Facing) => {
      const want = choice ?? facingRef.current;
      facingRef.current = want;
      release();
      const controller = new AbortController();
      run.current = controller;
      // A function, not a property read: the answer changes across the awaits below.
      const cancelled = () => controller.signal.aborted;
      setFacing(want);
      setReading(START_READING);
      setStatus({ kind: 'starting', loaded: 0, total: 1 });
      const model = getDetector(controller.signal, ({ loaded, total }) => {
        if (!cancelled()) setStatus({ kind: 'starting', loaded, total });
      });
      // A rejected model must not surface as an unhandled rejection while the camera is asked.
      model.catch(() => undefined);
      let media: MediaStream;
      try {
        media = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: want, width: { ideal: 960 } },
          audio: false,
        });
      } catch (error) {
        if (cancelled()) return;
        // Stop listening to the model download, or its progress would cover the message.
        controller.abort();
        setStatus({ kind: 'error', reason: cameraError(error) });
        return;
      }
      if (cancelled()) {
        media.getTracks().forEach((track) => {
          track.stop();
        });
        return;
      }
      stream.current = media;
      let detector: PoseDetector;
      try {
        detector = await model;
      } catch {
        if (cancelled()) return;
        release();
        setStatus({ kind: 'error', reason: 'model' });
        return;
      }
      if (cancelled()) return;
      const element = video.current;
      if (element !== null) {
        element.srcObject = media;
        element.muted = true;
        await element.play().catch(() => undefined);
      }
      const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
      setCanSwitch(devices.filter((d) => d.kind === 'videoinput').length > 1);
      if (cancelled()) return;
      setStatus({ kind: 'running' });
      loop(detector, controller.signal);
    },
    [getDetector, loop, release],
  );

  const stop = useCallback(() => {
    release();
    setReading(START_READING);
    setStatus({ kind: 'idle' });
  }, [release]);

  const switchCamera = useCallback(() => {
    void start(facingRef.current === 'environment' ? 'user' : 'environment');
  }, [start]);

  // Leaving the page or hiding the tab releases the camera at once.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden' && stream.current !== null) {
        release();
        setReading(START_READING);
        setStatus({ kind: 'hidden' });
      }
    };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      release();
    };
  }, [release]);

  const attachVideo = useCallback((node: HTMLVideoElement | null) => {
    video.current = node;
    if (node !== null && stream.current !== null) node.srcObject = stream.current;
  }, []);

  return { status, reading, caught, facing, canSwitch, start, stop, switchCamera, attachVideo };
}
