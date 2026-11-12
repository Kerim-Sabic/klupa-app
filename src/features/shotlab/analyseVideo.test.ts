import { describe, expect, it, vi } from 'vitest';
import {
  AnalysisCancelled,
  MAX_SECONDS,
  sampleVideo,
  SAMPLING_RATE,
  VideoUnreadable,
} from './analyseVideo';
import type { PoseDetector } from './detector';

type FrameCallback = (now: number, meta: { mediaTime: number }) => void;

/** Just enough of a video element: seeking fires `seeked`, playing presents frames at 25 fps. */
class FakeVideo extends EventTarget {
  readyState = 4;
  duration: number;
  muted = false;
  playbackRate = 1;
  paused = true;
  private time = 0;
  private pending: FrameCallback | null = null;
  readonly seeks: number[] = [];

  constructor(
    duration: number,
    private readonly playable = true,
    private readonly step = 0.04,
  ) {
    super();
    this.duration = duration;
  }

  get currentTime() {
    return this.time;
  }

  set currentTime(value: number) {
    this.time = value;
    this.seeks.push(value);
    setTimeout(() => this.dispatchEvent(new Event('seeked')), 0);
  }

  pause() {
    this.paused = true;
  }

  play(): Promise<void> {
    if (!this.playable) return Promise.reject(new Error('NotSupported'));
    this.paused = false;
    this.tick();
    return Promise.resolve();
  }

  requestVideoFrameCallback(callback: FrameCallback) {
    this.pending = callback;
    return 1;
  }

  private ticking = false;

  /** Present the next frame soon, once, unless paused; keep going while playing. */
  private tick() {
    if (this.ticking) return;
    this.ticking = true;
    setTimeout(() => {
      this.ticking = false;
      if (this.paused) return;
      if (this.time >= this.duration) {
        this.dispatchEvent(new Event('ended'));
        return;
      }
      const callback = this.pending;
      this.pending = null;
      const mediaTime = this.time;
      this.time += this.step;
      callback?.(0, { mediaTime });
      this.tick();
    }, 0);
  }
}

const detect = vi.fn(() => ({ image: null, world: null, people: 0 }));

function detector(): PoseDetector {
  detect.mockClear();
  return { delegate: 'CPU', beginClip: vi.fn(), detect, close: vi.fn() };
}

const asVideo = (fake: FakeVideo) => fake as unknown as HTMLVideoElement;

describe('sampleVideo by playback', () => {
  it('reads every presented frame with its own media time, slowly and muted', async () => {
    const video = new FakeVideo(1);
    const d = detector();
    const progress = vi.fn();
    const result = await sampleVideo(asVideo(video), d, new AbortController().signal, progress);
    expect(result.frames).toHaveLength(25);
    expect(result.frames[1]?.time).toBeCloseTo(0.04);
    expect(result.truncated).toBe(false);
    expect(video.playbackRate).toBe(SAMPLING_RATE);
    expect(video.muted).toBe(true);
    expect(detect).toHaveBeenLastCalledWith(video, 960);
    expect(progress).toHaveBeenLastCalledWith(30, 30);
  });

  it('stops at the cap and says the clip was cut', async () => {
    const result = await sampleVideo(
      asVideo(new FakeVideo(9)),
      detector(),
      new AbortController().signal,
      vi.fn(),
    );
    expect(result.truncated).toBe(true);
    expect(Math.max(...result.frames.map((f) => f.time))).toBeLessThanOrEqual(MAX_SECONDS);
  });

  it('can be cancelled', async () => {
    const controller = new AbortController();
    const run = sampleVideo(asVideo(new FakeVideo(4)), detector(), controller.signal, () => {
      controller.abort();
    });
    await expect(run).rejects.toBeInstanceOf(AnalysisCancelled);
  });

  it('reports a clip the browser refuses to play', async () => {
    const run = sampleVideo(
      asVideo(new FakeVideo(2, false)),
      detector(),
      new AbortController().signal,
      vi.fn(),
    );
    await expect(run).rejects.toBeInstanceOf(VideoUnreadable);
  });

  it('rejects a clip without a usable duration', async () => {
    const run = sampleVideo(
      asVideo(new FakeVideo(Number.NaN)),
      detector(),
      new AbortController().signal,
      vi.fn(),
    );
    await expect(run).rejects.toBeInstanceOf(VideoUnreadable);
  });
});

describe('sampleVideo by seeking (no requestVideoFrameCallback)', () => {
  it('falls back to seeking when playback outran the detector', async () => {
    const video = new FakeVideo(1, true, 0.25);
    const result = await sampleVideo(
      asVideo(video),
      detector(),
      new AbortController().signal,
      vi.fn(),
    );
    expect(result.frames).toHaveLength(30);
    expect(video.seeks).toHaveLength(30);
  });

  it('seeks half a frame in, then every 1/30 s', async () => {
    const video = new FakeVideo(0.5);
    Object.defineProperty(video, 'requestVideoFrameCallback', { value: undefined });
    const d = detector();
    const result = await sampleVideo(asVideo(video), d, new AbortController().signal, vi.fn());
    expect(result.frames).toHaveLength(15);
    expect(video.seeks[0]).toBeCloseTo(1 / 60);
    expect(detect).toHaveBeenCalledTimes(15);
  });

  it('waits for the first frame before it starts', async () => {
    const video = new FakeVideo(0.2);
    Object.defineProperty(video, 'requestVideoFrameCallback', { value: undefined });
    video.readyState = 0;
    setTimeout(() => video.dispatchEvent(new Event('loadeddata')), 0);
    const result = await sampleVideo(
      asVideo(video),
      detector(),
      new AbortController().signal,
      vi.fn(),
    );
    expect(result.frames).toHaveLength(6);
  });

  it('can be cancelled between seeks', async () => {
    const video = new FakeVideo(1);
    Object.defineProperty(video, 'requestVideoFrameCallback', { value: undefined });
    const controller = new AbortController();
    const run = sampleVideo(asVideo(video), detector(), controller.signal, () => {
      controller.abort();
    });
    await expect(run).rejects.toBeInstanceOf(AnalysisCancelled);
  });
});
