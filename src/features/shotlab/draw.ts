import type { Foot, Point3 } from '../../engine/pose';
import { POSE_BONES } from './skeleton';
import type { ImagePoint } from './detector';
import type { TokenColors } from './useTokens';

export interface Point2 {
  readonly x: number;
  readonly y: number;
}

const KICKING_POINTS: Readonly<Record<Foot, readonly number[]>> = {
  left: [23, 25, 27, 29, 31],
  right: [24, 26, 28, 30, 32],
};

/** Is this bone part of the kicking leg (hip to toe)? */
export function isKickingBone(a: number, b: number, foot: Foot | null): boolean {
  if (foot === null) return false;
  const leg = KICKING_POINTS[foot];
  return leg.includes(a) && leg.includes(b);
}

/** Index of the ankle of a foot. */
export const ankleIndex = (foot: Foot): number => (foot === 'left' ? 27 : 28);

/** Bounds of x and y over a whole clip, so a side view keeps one scale throughout. */
export function sideViewBounds(poses: readonly (readonly Point3[])[]): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
} {
  const xs = poses.flatMap((pose) => pose.map((p) => p.x));
  const ys = poses.flatMap((pose) => pose.map((p) => p.y));
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

/** Map world x/y (metres, +y down) into a canvas box with padding, same scale on both axes. */
export function sideViewProjector(
  bounds: ReturnType<typeof sideViewBounds>,
  width: number,
  height: number,
  padding = 24,
): (p: Point3) => Point2 {
  const spanX = Math.max(bounds.maxX - bounds.minX, 0.5);
  const spanY = Math.max(bounds.maxY - bounds.minY, 0.5);
  const scale = Math.min((width - 2 * padding) / spanX, (height - 2 * padding) / spanY);
  const offsetX = (width - spanX * scale) / 2 - bounds.minX * scale;
  const offsetY = (height - spanY * scale) / 2 - bounds.minY * scale;
  return (p) => ({ x: p.x * scale + offsetX, y: p.y * scale + offsetY });
}

export interface SkeletonStyle {
  readonly colors: TokenColors;
  readonly foot: Foot | null;
  readonly lineWidth: number;
}

/**
 * Draw one skeleton. Points with low visibility are drawn faint rather than hidden, so
 * the coach sees where the model was unsure instead of a confident-looking guess.
 */
export function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  points: readonly (Point2 & { readonly visibility?: number })[],
  style: SkeletonStyle,
): void {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const [a, b] of POSE_BONES) {
    const p = points[a];
    const q = points[b];
    if (p === undefined || q === undefined) continue;
    const kicking = isKickingBone(a, b, style.foot);
    const sure = Math.min(p.visibility ?? 1, q.visibility ?? 1) >= 0.5;
    ctx.globalAlpha = sure ? 1 : 0.35;
    ctx.lineWidth = style.lineWidth + (kicking ? 1.5 : 0) + 2;
    // A dark halo under each bone keeps it readable on any video background.
    ctx.strokeStyle = style.colors.ink;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(q.x, q.y);
    ctx.stroke();
    ctx.lineWidth = style.lineWidth + (kicking ? 1.5 : 0);
    ctx.strokeStyle = kicking ? style.colors.pitch : style.colors.paper;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const nose = points[0];
  if (nose !== undefined) {
    ctx.fillStyle = style.colors.paper;
    ctx.strokeStyle = style.colors.ink;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(nose.x, nose.y, style.lineWidth * 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

/** A fading trail of the kicking foot, oldest first. */
export function drawTrail(
  ctx: CanvasRenderingContext2D,
  trail: readonly Point2[],
  color: string,
): void {
  trail.forEach((p, i) => {
    ctx.globalAlpha = 0.15 + (0.85 * (i + 1)) / trail.length;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
}

/** Image landmarks (0..1) to canvas pixels. */
export function imageToCanvas(points: readonly ImagePoint[], width: number, height: number) {
  return points.map((p) => ({ x: p.x * width, y: p.y * height, visibility: p.visibility }));
}

/** Frames whose kicking-foot positions make the trail: backswing minus a little to the follow-through. */
export function trailRange(
  backswing: number,
  strike: number,
  follow: number | null,
  current: number,
): readonly [number, number] {
  const start = Math.max(0, backswing - 6);
  const end = Math.min(current, follow ?? strike + 6);
  return [start, end];
}
