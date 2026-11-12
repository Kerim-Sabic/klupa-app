import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Foot, Point3 } from '../../engine/pose';
import type { DetectedFrame } from './detector';
import {
  ankleIndex,
  drawSkeleton,
  drawTrail,
  imageToCanvas,
  sideViewBounds,
  sideViewProjector,
  type Point2,
} from './draw';
import { useTokens } from './useTokens';

export interface StageProps {
  readonly frames: readonly DetectedFrame[];
  /** Smoothed world poses (example view), or empty. */
  readonly poses: readonly (readonly Point3[])[];
  readonly index: number;
  readonly videoUrl: string | null;
  readonly foot: Foot | null;
  readonly trail: readonly [number, number] | null;
}

function useBoxSize(target: HTMLElement | null): { width: number; height: number } {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    if (target === null || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(([entry]) => {
      if (entry !== undefined) {
        setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
      }
    });
    observer.observe(target);
    return () => {
      observer.disconnect();
    };
  }, [target]);
  return size;
}

/**
 * The clip with the skeleton over it. The overlay canvas has the video's own aspect
 * ratio and follows its size; for the example there is no video, so the skeleton is
 * drawn side-on from the world coordinates instead.
 */
export function VideoStage({ frames, poses, index, videoUrl, foot, trail }: StageProps) {
  const { t } = useTranslation();
  const colors = useTokens();
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [aspect, setAspect] = useState(videoUrl === null ? 4 / 3 : 16 / 9);
  const { width, height } = useBoxSize(box);
  const frame = frames[index];
  const bounds = useMemo(() => (poses.length > 0 ? sideViewBounds(poses) : null), [poses]);

  useEffect(() => {
    const element = video.current;
    if (element === null || frame === undefined) return;
    if (Math.abs(element.currentTime - frame.time) > 0.001) element.currentTime = frame.time;
  }, [frame]);

  useEffect(() => {
    const element = canvas.current;
    const ctx = element?.getContext('2d') ?? null;
    if (element === null || ctx === null || width === 0) return;
    const ratio = window.devicePixelRatio || 1;
    element.width = Math.round(width * ratio);
    element.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    let points: (Point2 & { visibility?: number })[] = [];
    let trailPoints: Point2[] = [];
    const image = frame?.image ?? null;
    if (videoUrl !== null && image !== null) {
      points = imageToCanvas(image, width, height);
      if (trail !== null && foot !== null) {
        trailPoints = frames.slice(trail[0], trail[1] + 1).flatMap((f) => {
          const ankle = f.image?.[ankleIndex(foot)];
          return ankle === undefined ? [] : imageToCanvas([ankle], width, height);
        });
      }
    } else if (bounds !== null) {
      const project = sideViewProjector(bounds, width, height);
      const pose = poses[index];
      points = pose === undefined ? [] : pose.map(project);
      ctx.strokeStyle = colors.line;
      ctx.lineWidth = 2;
      ctx.beginPath();
      const ground = project({ x: 0, y: bounds.maxY, z: 0 }).y + 2;
      ctx.moveTo(0, ground);
      ctx.lineTo(width, ground);
      ctx.stroke();
      if (trail !== null && foot !== null) {
        trailPoints = poses.slice(trail[0], trail[1] + 1).flatMap((pose) => {
          const ankle = pose[ankleIndex(foot)];
          return ankle === undefined ? [] : [project(ankle)];
        });
      }
    }
    if (foot !== null) drawTrail(ctx, trailPoints, colors.amber);
    drawSkeleton(ctx, points, { colors, foot, lineWidth: Math.max(3, width / 160) });
  }, [bounds, colors, foot, frame, frames, height, index, poses, trail, videoUrl, width]);

  return (
    <div
      ref={setBox}
      className="relative mx-auto w-full overflow-hidden rounded-card border border-line bg-ink"
      style={{
        aspectRatio: String(aspect),
        maxHeight: '70dvh',
        maxWidth: `calc(70dvh * ${String(aspect)})`,
      }}
    >
      {videoUrl !== null ? (
        <video
          ref={video}
          src={videoUrl}
          muted
          playsInline
          preload="auto"
          aria-label={t('shotlab.stage.videoLabel')}
          className="absolute inset-0 size-full object-contain"
          onLoadedMetadata={(event) => {
            const { videoWidth, videoHeight } = event.currentTarget;
            if (videoWidth > 0 && videoHeight > 0) setAspect(videoWidth / videoHeight);
          }}
        />
      ) : (
        <div aria-hidden="true" className="absolute inset-0 bg-pitch-soft" />
      )}
      <canvas
        ref={canvas}
        role="img"
        aria-label={t(
          videoUrl === null ? 'shotlab.stage.exampleLabel' : 'shotlab.stage.overlayLabel',
        )}
        className="absolute inset-0 size-full"
      />
    </div>
  );
}
