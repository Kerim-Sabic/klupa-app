import { useCallback, useEffect, useRef, useState } from 'react';
import { cameraError } from '../shotlab/useLiveCamera';
import type { GetDetector, PlayerDetector } from './detector';
import {
  EMPTY_FRAME,
  EMPTY_OVERLAY,
  nextAnalysisAt,
  recentFrames,
  stepOverlay,
  type OverlayFrame,
  type TeamColours,
} from './model';
import type { ReadPixels } from './pixels';
import type { Team } from './teams';

export type OverlaySource = 'camera' | 'file';
export type OverlayError = 'denied' | 'no-camera' | 'in-use' | 'model' | 'video' | 'unknown';

export type OverlayStatus =
  | { readonly kind: 'idle' }
  | {
      readonly kind: 'starting';
      readonly source: OverlaySource;
      readonly loaded: number;
      readonly total: number;
    }
  | { readonly kind: 'running'; readonly source: OverlaySource; readonly paused: boolean }
  | { readonly kind: 'hidden' }
  | { readonly kind: 'error'; readonly reason: OverlayError };

export interface OverlayReading {
  /** Frames analysed in the last second. */
  readonly fps: number;
  readonly counts: Readonly<Record<Team, number>>;
  readonly colours: TeamColours;
}

/** How often the numbers beside the picture are refreshed, in milliseconds. */
export const PUBLISH_MS = 200;

const START_READING: OverlayReading = {
  fps: 0,
  counts: EMPTY_FRAME.counts,
  colours: EMPTY_FRAME.colours,
};

/**
 * The live overlay. A picture goes from the camera, or from a file the coach picked, to a
 * video element on this page, and from there to a detector that runs on this page. Nothing is
 * recorded or sent: between two frames only boxes, one colour per player and the two team
 * colours are remembered, in memory, and they are dropped on Stop.
 */
export function useOverlay(
  getDetector: GetDetector,
  readPixels: ReadPixels,
  draw: (frame: OverlayFrame) => void,
) {
  const [status, setStatus] = useState<OverlayStatus>({ kind: 'idle' });
  const [reading, setReading] = useState<OverlayReading>(START_READING);
  const video = useRef<HTMLVideoElement | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const fileUrl = useRef<string | null>(null);
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
    const element = video.current;
    if (element !== null) {
      element.pause();
      element.srcObject = null;
      element.removeAttribute('src');
    }
    if (fileUrl.current !== null) URL.revokeObjectURL(fileUrl.current);
    fileUrl.current = null;
    drawRef.current(EMPTY_FRAME);
  }, []);

  const loop = useCallback(
    (detector: PlayerDetector, signal: AbortSignal) => {
      let state = EMPTY_OVERLAY;
      let times: number[] = [];
      let shownTime = -1;
      let before: number | null = null;
      let published = 0;
      let notBefore = 0;
      const tick = () => {
        if (signal.aborted) return;
        frame.current = requestAnimationFrame(tick);
        const element = video.current;
        // Only a new picture is worth analysing: a paused video or a stalled camera is skipped.
        if (element === null || element.readyState < 2 || element.currentTime === shownTime) return;
        const now = performance.now();
        // The page rests between analyses, so a slow device still answers a tap on Stop.
        if (now < notBefore) return;
        shownTime = element.currentTime;
        const detections = detector.detect(element, now);
        const result = stepOverlay(
          state,
          detections,
          readPixels(element),
          before === null ? 0 : (now - before) / 1000,
        );
        before = now;
        state = result.state;
        drawRef.current(result.frame);
        const finished = performance.now();
        notBefore = nextAnalysisAt(finished, finished - now);
        times = recentFrames(times, now);
        if (now - published < PUBLISH_MS) return;
        published = now;
        setReading({
          fps: times.length,
          counts: result.frame.counts,
          colours: result.frame.colours,
        });
      };
      frame.current = requestAnimationFrame(tick);
    },
    [readPixels],
  );

  const start = useCallback(
    async (source: OverlaySource, file?: File | string) => {
      release();
      const controller = new AbortController();
      run.current = controller;
      // A function, not a property read: the answer changes across the awaits below.
      const cancelled = () => controller.signal.aborted;
      setReading(START_READING);
      setStatus({ kind: 'starting', source, loaded: 0, total: 1 });
      const model = getDetector(controller.signal, ({ loaded, total }) => {
        if (!cancelled()) setStatus({ kind: 'starting', source, loaded, total });
      });
      // A rejected model must not surface as an unhandled rejection while the camera is asked.
      model.catch(() => undefined);
      const fail = (reason: OverlayError) => {
        release();
        setStatus({ kind: 'error', reason });
      };
      if (source === 'camera') {
        try {
          const media = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment', width: { ideal: 1280 } },
            audio: false,
          });
          if (cancelled()) {
            media.getTracks().forEach((track) => {
              track.stop();
            });
            return;
          }
          stream.current = media;
        } catch (error) {
          if (!cancelled()) fail(cameraError(error));
          return;
        }
      } else if (file instanceof File) {
        fileUrl.current = URL.createObjectURL(file);
      }
      let detector: PlayerDetector;
      try {
        detector = await model;
      } catch {
        if (!cancelled()) fail('model');
        return;
      }
      if (cancelled()) return;
      const element = video.current;
      if (element !== null) {
        element.muted = true;
        element.loop = source === 'file';
        if (source === 'camera') element.srcObject = stream.current;
        else element.src = typeof file === 'string' ? file : (fileUrl.current ?? '');
        try {
          await element.play();
        } catch {
          // A file the browser cannot decode fails here; a camera stream never should.
          if (!cancelled() && source === 'file') fail('video');
          if (source === 'file') return;
        }
      }
      if (cancelled()) return;
      setStatus({ kind: 'running', source, paused: false });
      loop(detector, controller.signal);
    },
    [getDetector, loop, release],
  );

  const stop = useCallback(() => {
    release();
    setReading(START_READING);
    setStatus({ kind: 'idle' });
  }, [release]);

  /** Pause or resume a video file; the overlay stays on the paused picture. */
  const togglePause = useCallback(() => {
    const element = video.current;
    if (element === null) return;
    const paused = !element.paused;
    if (paused) element.pause();
    else void element.play().catch(() => undefined);
    setStatus((current) => (current.kind === 'running' ? { ...current, paused } : current));
  }, []);

  // Leaving the page or hiding the tab lets go of the camera at once.
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
  }, []);

  return {
    status,
    reading,
    startCamera: useCallback(() => start('camera'), [start]),
    /** A video the coach picked, or the address of the sample clip this site serves. */
    startFile: useCallback((file: File | string) => start('file', file), [start]),
    stop,
    togglePause,
    attachVideo,
  };
}
