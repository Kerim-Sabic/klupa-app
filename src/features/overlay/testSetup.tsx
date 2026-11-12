import { vi } from 'vitest';
import { renderUi } from '../../ui/testUtils';
import { installCamera, installFrames } from '../shotlab/liveFakes';
import type { GetDetector } from './detector';
import { OverlayPage } from './OverlayPage';
import type { Pixels } from './teams';
import type { Detection } from './track';

/**
 * Test support for the overlay page: a camera, animation frames run by hand, a detector that
 * always finds the same two people, and the page rendered with them.
 */
export const PEOPLE: Detection[] = [
  { x: 0.2, y: 0.3, w: 0.06, h: 0.3, score: 0.9 },
  { x: 0.7, y: 0.4, w: 0.06, h: 0.3, score: 0.9 },
];

/** A picture whose left half is red and whose right half is blue: one player in each. */
export function twoKits(): Pixels {
  const data = new Uint8ClampedArray(100 * 50 * 4);
  for (let i = 0; i < 100 * 50; i += 1)
    data.set(i % 100 < 50 ? [210, 30, 40] : [30, 60, 190], i * 4);
  return { data, width: 100, height: 50 };
}

export function setup(options: { pixels?: Pixels | null; model?: 'fails' } = {}) {
  const camera = installCamera(1);
  const clock = installFrames(1000 / 15);
  let paused = false;
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {
    paused = true;
  });
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => {
    paused = false;
    return Promise.resolve();
  });
  Object.defineProperty(HTMLMediaElement.prototype, 'paused', {
    configurable: true,
    get: () => paused,
  });
  const createUrl = vi.fn(() => 'blob:picked-video');
  const revokeUrl = vi.fn();
  vi.stubGlobal(
    'URL',
    Object.assign(URL, { createObjectURL: createUrl, revokeObjectURL: revokeUrl }),
  );
  const detector = { delegate: 'CPU' as const, detect: vi.fn(() => PEOPLE), close: vi.fn() };
  const getDetector = vi.fn<GetDetector>((_signal, onProgress) => {
    onProgress({ loaded: 3_627_170, total: 7_254_339 });
    return options.model === 'fails'
      ? Promise.reject(new Error('offline'))
      : Promise.resolve(detector);
  });
  const pixels = vi.fn(() => options.pixels ?? null);
  const view = renderUi(<OverlayPage detector={getDetector} pixels={pixels} />);
  return { ...view, camera, clock, detector, getDetector, pixels, play, createUrl, revokeUrl };
}
