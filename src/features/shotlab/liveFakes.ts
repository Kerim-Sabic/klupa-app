import { vi } from 'vitest';
import type { PoseFrame } from '../../engine/pose';
import type { PoseDetector } from './detector';

/**
 * Test support for the live camera: a fake camera stream, a fake landmarker that plays
 * back synthetic frames, a controllable clock and animation frames that run on demand.
 */
export interface FakeCamera {
  readonly tracks: { stop: ReturnType<typeof vi.fn> }[];
  readonly getUserMedia: ReturnType<typeof vi.fn>;
  readonly enumerateDevices: ReturnType<typeof vi.fn>;
}

export function installCamera(cameras = 1): FakeCamera {
  const tracks: FakeCamera['tracks'] = [];
  const getUserMedia = vi.fn(() => {
    const track = { stop: vi.fn() };
    tracks.push(track);
    return Promise.resolve({ getTracks: () => [track] });
  });
  const enumerateDevices = vi.fn(() =>
    Promise.resolve(Array.from({ length: cameras }, () => ({ kind: 'videoinput' }))),
  );
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia, enumerateDevices },
  });
  return { tracks, getUserMedia, enumerateDevices };
}

export function removeCamera(): void {
  Reflect.deleteProperty(navigator, 'mediaDevices');
}

/** A clock and animation frames the test advances by hand. */
export function installFrames(stepMs: number) {
  let now = 0;
  let mediaTime = 0;
  let queue: FrameRequestCallback[] = [];
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => queue.push(callback));
  vi.stubGlobal('cancelAnimationFrame', () => {
    queue = [];
  });
  // A playing camera: ready, and showing a new picture every time it is asked.
  Object.defineProperty(HTMLMediaElement.prototype, 'readyState', {
    configurable: true,
    get: () => 4,
  });
  Object.defineProperty(HTMLMediaElement.prototype, 'currentTime', {
    configurable: true,
    get: () => mediaTime,
    set: () => undefined,
  });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  return {
    /** Run `count` animation frames, `stepMs` apart. */
    run(count: number) {
      for (let i = 0; i < count; i += 1) {
        now += stepMs;
        mediaTime += stepMs / 1000;
        const pending = queue;
        queue = [];
        pending.forEach((callback) => {
          callback(now);
        });
      }
    },
    pending: () => queue.length,
  };
}

/** A landmarker that returns the given frames one after another, then the last one. */
export function fakeDetector(frames: readonly PoseFrame[]): PoseDetector {
  let next = 0;
  return {
    delegate: 'CPU',
    beginClip: vi.fn(),
    close: vi.fn(),
    detect: vi.fn(() => {
      const frame = frames[Math.min(next, frames.length - 1)];
      next += 1;
      const world = frame?.world ?? null;
      return {
        world,
        image:
          world === null
            ? null
            : world.map((p) => ({ x: 0.5 + p.x / 4, y: 0.3 + p.y / 3, visibility: p.visibility })),
        people: world === null ? 0 : 1,
      };
    }),
  };
}
