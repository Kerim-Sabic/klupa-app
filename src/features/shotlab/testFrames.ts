import type { PoseFrame } from '../../engine/pose';
import { partnerIndex } from './synthetic';

/**
 * Test support: the same frames as a horizontally flipped video would give, with left and
 * right labels swapped and x negated. Used to check that analysis and drawing do not depend
 * on which way the player faces.
 */
export function mirrorFrames(frames: readonly PoseFrame[]): PoseFrame[] {
  return frames.map((frame) => {
    const { world } = frame;
    if (world === null) return frame;
    return {
      ...frame,
      world: world.map((point, index) => {
        const partner = world[partnerIndex(index)] ?? point;
        return { ...partner, x: -partner.x };
      }),
    };
  });
}
