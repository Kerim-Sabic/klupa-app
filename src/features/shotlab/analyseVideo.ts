import type { DetectedFrame, PoseDetector } from './detector';

/** Frames per second we sample, whatever the clip's own rate. */
export const SAMPLE_FPS = 30;
/** Longest stretch analysed. A strike plus run-up fits; longer clips are cut and the coach told. */
export const MAX_SECONDS = 6;

export interface VideoSampling {
  readonly frames: DetectedFrame[];
  /** The clip was longer than MAX_SECONDS and only the start was analysed. */
  readonly truncated: boolean;
  readonly duration: number;
}

export class AnalysisCancelled extends Error {
  constructor() {
    super('Analysis cancelled.');
    this.name = 'AnalysisCancelled';
  }
}

export class VideoUnreadable extends Error {
  constructor() {
    super('The video could not be read.');
    this.name = 'VideoUnreadable';
  }
}

function once(video: HTMLVideoElement, event: 'loadeddata' | 'seeked', signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const done = () => {
      cleanup();
      resolve();
    };
    const fail = () => {
      cleanup();
      reject(signal.aborted ? new AnalysisCancelled() : new VideoUnreadable());
    };
    // A browser that never answers a seek must not hang the page.
    const timer = window.setTimeout(fail, 8000);
    const cleanup = () => {
      window.clearTimeout(timer);
      video.removeEventListener(event, done);
      video.removeEventListener('error', fail);
      signal.removeEventListener('abort', fail);
    };
    video.addEventListener(event, done);
    video.addEventListener('error', fail);
    signal.addEventListener('abort', fail);
  });
}

/** Wait until the video can show a frame. */
export async function whenReady(video: HTMLVideoElement, signal: AbortSignal): Promise<void> {
  if (video.readyState >= 2) return;
  await once(video, 'loadeddata', signal);
}

/** Playback speed while sampling: slow enough that the detector keeps up with every frame. */
export const SAMPLING_RATE = 0.5;

type Progress = (done: number, total: number) => void;

/**
 * Fallback for browsers without `requestVideoFrameCallback`: seek one sample every
 * 1/30 s. Exact, but seeking costs a decode from the last keyframe each time, which on
 * a phone clip is many times slower than playing.
 */
async function bySeeking(
  video: HTMLVideoElement,
  detector: PoseDetector,
  signal: AbortSignal,
  span: number,
  onProgress: Progress,
): Promise<DetectedFrame[]> {
  const total = Math.max(1, Math.floor(span * SAMPLE_FPS));
  const frames: DetectedFrame[] = [];
  for (let i = 0; i < total; i += 1) {
    if (signal.aborted) throw new AnalysisCancelled();
    // Half a frame in, so the first seek always moves and the last stays inside the clip.
    const time = (i + 0.5) / SAMPLE_FPS;
    const seeked = once(video, 'seeked', signal);
    video.currentTime = time;
    await seeked;
    frames.push({ time, ...detector.detect(video, Math.round(time * 1000)) });
    onProgress(i + 1, total);
  }
  return frames;
}

/**
 * Play the clip slowly and run the detector on every frame the browser presents, with
 * the frame's own media time. No seeking, so it is many times faster; frames the
 * detector could not keep up with are skipped, which the caller checks for.
 */
function byPlayback(
  video: HTMLVideoElement,
  detector: PoseDetector,
  signal: AbortSignal,
  span: number,
  onProgress: Progress,
): Promise<DetectedFrame[]> {
  const total = Math.max(1, Math.floor(span * SAMPLE_FPS));
  const frames: DetectedFrame[] = [];
  return new Promise((resolve, reject) => {
    let last = -1;
    let stall = 0;
    let done = false;
    const stop = (error: Error | null) => {
      if (done) return;
      done = true;
      window.clearTimeout(stall);
      video.pause();
      video.removeEventListener('ended', ended);
      signal.removeEventListener('abort', aborted);
      if (error === null) resolve(frames);
      else reject(error);
    };
    const ended = () => {
      stop(null);
    };
    const aborted = () => {
      stop(new AnalysisCancelled());
    };
    const watch = () => {
      window.clearTimeout(stall);
      // A clip that stops presenting frames must not hang the page.
      stall = window.setTimeout(() => {
        stop(new VideoUnreadable());
      }, 8000);
    };
    const onFrame = (_now: number, meta: VideoFrameCallbackMetadata) => {
      if (done) return;
      const time = meta.mediaTime;
      if (time > span) {
        stop(null);
        return;
      }
      if (time > last) {
        last = time;
        frames.push({ time, ...detector.detect(video, Math.round(time * 1000)) });
        onProgress(Math.min(total, Math.round(time * SAMPLE_FPS) + 1), total);
      }
      watch();
      video.requestVideoFrameCallback(onFrame);
    };
    video.addEventListener('ended', ended);
    signal.addEventListener('abort', aborted);
    video.playbackRate = SAMPLING_RATE;
    video.requestVideoFrameCallback(onFrame);
    watch();
    video.play().catch(() => {
      stop(signal.aborted ? new AnalysisCancelled() : new VideoUnreadable());
    });
  });
}

/** Fewer samples per second of clip than this means playback outran the detector. */
const MIN_PLAYBACK_FPS = 12;

/**
 * Read up to MAX_SECONDS of the clip, frame by frame, through the detector. The video
 * element is the one on screen: the coach watches their own clip being read.
 */
export async function sampleVideo(
  video: HTMLVideoElement,
  detector: PoseDetector,
  signal: AbortSignal,
  onProgress: Progress,
): Promise<VideoSampling> {
  await whenReady(video, signal);
  const duration = video.duration;
  if (!Number.isFinite(duration) || duration <= 0) throw new VideoUnreadable();
  const span = Math.min(duration, MAX_SECONDS);
  video.pause();
  video.muted = true;
  detector.beginClip();
  let frames: DetectedFrame[] = [];
  if (typeof video.requestVideoFrameCallback === 'function') {
    // The first inference compiles GPU programs and can take seconds; do it on the
    // still first frame, so playback does not run on unread meanwhile.
    detector.detect(video, 0);
    frames = await byPlayback(video, detector, signal, span, onProgress);
  }
  if (frames.length < span * MIN_PLAYBACK_FPS) {
    detector.beginClip();
    frames = await bySeeking(video, detector, signal, span, onProgress);
  }
  return { frames, truncated: duration > MAX_SECONDS + 0.05, duration };
}
