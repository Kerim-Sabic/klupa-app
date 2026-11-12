import type { DetectedFrame } from './detector';
import { synthesizeKick } from './synthetic';

/**
 * The example clip: a synthetic right-footed strike with a little seeded jitter, so the
 * whole page can be explored without a video. The plant foot lands a touch far back on
 * purpose, so the example also shows what a coaching prompt looks like.
 */
export function exampleFrames(): DetectedFrame[] {
  return synthesizeKick({
    duration: 2.4,
    strikeTime: 1.3,
    backswingKnee: 72,
    followThrough: 88,
    plantForward: -0.34,
    plantSide: 0.26,
    trunkLean: 3,
    separation: 24,
    noise: 0.004,
    seed: 11,
  }).map((frame) => ({ ...frame, image: null }));
}
