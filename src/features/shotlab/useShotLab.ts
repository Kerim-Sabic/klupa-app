import { useCallback, useEffect, useRef, useState } from 'react';
import { analyseShot, type ShotAnalysis } from '../../engine/pose';
import { AnalysisCancelled, sampleVideo, VideoUnreadable } from './analyseVideo';
import {
  createDetector,
  type DetectedFrame,
  type LoadProgress,
  type PoseDetector,
} from './detector';
import { exampleFrames } from './example';
import type { CaughtStrike } from './liveModel';

export type ErrorReason = 'model' | 'video' | 'unknown';

export type ShotLabState =
  | { readonly phase: 'start' }
  | { readonly phase: 'live' }
  | { readonly phase: 'unsupported' }
  | { readonly phase: 'loading-model'; readonly loaded: number; readonly total: number }
  | { readonly phase: 'analysing'; readonly done: number; readonly total: number }
  | {
      readonly phase: 'result';
      readonly source: 'video' | 'example' | 'live';
      readonly frames: readonly DetectedFrame[];
      readonly analysis: ShotAnalysis;
      readonly truncated: boolean;
    }
  | { readonly phase: 'error'; readonly reason: ErrorReason };

class ModelUnavailable extends Error {
  constructor(cause: unknown) {
    super('The pose model could not be loaded.', { cause });
    this.name = 'ModelUnavailable';
  }
}

/** Can this browser run the detector at all? WebAssembly is the hard requirement. */
export function canRunDetector(): boolean {
  return typeof WebAssembly === 'object' && typeof WebAssembly.instantiate === 'function';
}

/**
 * The Shot lab state machine. The video stays an object URL in this tab: it is never
 * uploaded, never stored, and the URL is revoked as soon as it is no longer shown.
 */
export function useShotLab() {
  const [state, setState] = useState<ShotLabState>({ phase: 'start' });
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const detector = useRef<PoseDetector | null>(null);
  const run = useRef<AbortController | null>(null);
  const pendingFile = useRef<boolean>(false);

  // The effect below revokes the previous URL whenever this one changes, and on unmount.
  const replaceUrl = setVideoUrl;

  useEffect(
    () => () => {
      run.current?.abort();
      detector.current?.close();
      detector.current = null;
    },
    [],
  );
  useEffect(
    () => () => {
      if (videoUrl !== null) URL.revokeObjectURL(videoUrl);
    },
    [videoUrl],
  );

  const analyse = useCallback(async () => {
    const video = videoRef.current;
    if (video === null || !pendingFile.current) return;
    pendingFile.current = false;
    const controller = new AbortController();
    run.current = controller;
    try {
      if (detector.current === null) {
        setState({ phase: 'loading-model', loaded: 0, total: 1 });
        try {
          detector.current = await createDetector(controller.signal, ({ loaded, total }) => {
            setState({ phase: 'loading-model', loaded, total });
          });
        } catch (error) {
          if (controller.signal.aborted) throw new AnalysisCancelled();
          throw new ModelUnavailable(error);
        }
      }
      const ready = detector.current;
      setState({ phase: 'analysing', done: 0, total: 1 });
      const sampled = await sampleVideo(video, ready, controller.signal, (done, total) => {
        setState({ phase: 'analysing', done, total });
      });
      setState({
        phase: 'result',
        source: 'video',
        frames: sampled.frames,
        analysis: analyseShot(sampled.frames),
        truncated: sampled.truncated,
      });
    } catch (error) {
      if (error instanceof AnalysisCancelled) return;
      replaceUrl(null);
      const reason: ErrorReason =
        error instanceof VideoUnreadable
          ? 'video'
          : error instanceof ModelUnavailable
            ? 'model'
            : 'unknown';
      setState({ phase: 'error', reason });
    } finally {
      if (run.current === controller) run.current = null;
    }
  }, [replaceUrl]);

  /** Called by the page once the hidden analysis video element is mounted. */
  const attachVideo = useCallback(
    (node: HTMLVideoElement | null) => {
      videoRef.current = node;
      if (node !== null) void analyse();
    },
    [analyse],
  );

  const chooseFile = useCallback(
    (file: File) => {
      if (!canRunDetector()) {
        setState({ phase: 'unsupported' });
        return;
      }
      run.current?.abort();
      pendingFile.current = true;
      replaceUrl(URL.createObjectURL(file));
      setState({ phase: 'loading-model', loaded: 0, total: 1 });
    },
    [replaceUrl],
  );

  const showExample = useCallback(() => {
    run.current?.abort();
    replaceUrl(null);
    const frames = exampleFrames();
    setState({
      phase: 'result',
      source: 'example',
      frames,
      analysis: analyseShot(frames),
      truncated: false,
    });
  }, [replaceUrl]);

  /**
   * The detector for the camera, created once and shared with clips. One load serves
   * every caller (a restart while it downloads joins the same load), so the caller's
   * own abort signal only stops it from hearing progress, never the download itself.
   */
  const loading = useRef<Promise<PoseDetector> | null>(null);
  const listeners = useRef(new Set<(progress: LoadProgress) => void>());
  const getDetector = useCallback(
    async (signal: AbortSignal, onProgress: (progress: LoadProgress) => void) => {
      if (detector.current !== null) return detector.current;
      listeners.current.add(onProgress);
      signal.addEventListener('abort', () => listeners.current.delete(onProgress));
      loading.current ??= createDetector(new AbortController().signal, (progress) => {
        listeners.current.forEach((listener) => {
          listener(progress);
        });
      });
      try {
        detector.current = await loading.current;
        return detector.current;
      } catch (error) {
        loading.current = null;
        throw error;
      } finally {
        listeners.current.delete(onProgress);
      }
    },
    [],
  );

  const startLive = useCallback(() => {
    if (!canRunDetector()) {
      setState({ phase: 'unsupported' });
      return;
    }
    run.current?.abort();
    replaceUrl(null);
    setState({ phase: 'live' });
  }, [replaceUrl]);

  /** Open a strike caught by the camera: skeleton only, as no video was kept. */
  const showCaught = useCallback((caught: CaughtStrike) => {
    setState({
      phase: 'result',
      source: 'live',
      frames: caught.frames.map((frame) => ({ ...frame, image: null })),
      analysis: caught.analysis,
      truncated: false,
    });
  }, []);

  const reset = useCallback(() => {
    run.current?.abort();
    pendingFile.current = false;
    replaceUrl(null);
    setState({ phase: 'start' });
  }, [replaceUrl]);

  return {
    state,
    videoUrl,
    attachVideo,
    chooseFile,
    showExample,
    startLive,
    showCaught,
    getDetector,
    reset,
    cancel: reset,
  };
}
