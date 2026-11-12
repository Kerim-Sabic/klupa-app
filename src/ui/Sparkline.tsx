import { motion } from 'motion/react';
import { useRef } from 'react';
import { useDrawn } from './Ring';
import { SPRING, cx } from './internal';

export type SparklineTone = 'ink' | 'pitch' | 'seen' | 'effort';

const TONE: Record<SparklineTone, { line: string; dot: string }> = {
  ink: { line: 'stroke-ink', dot: 'fill-ink' },
  pitch: { line: 'stroke-pitch', dot: 'fill-pitch' },
  seen: { line: 'stroke-ring-seen', dot: 'fill-ring-seen' },
  effort: { line: 'stroke-ring-effort', dot: 'fill-ring-effort' },
};

export interface SparkPoint {
  x: number;
  y: number;
}

/**
 * Points of a sparkline in a `width` x `height` box with `pad` kept clear for the stroke.
 * A flat series sits in the middle; one value is a single point in the middle.
 */
export function sparkPoints(
  values: readonly number[],
  width: number,
  height: number,
  pad = 2,
): SparkPoint[] {
  const finite = values.filter((value) => Number.isFinite(value));
  if (finite.length === 0) return [];
  const low = Math.min(...finite);
  const high = Math.max(...finite);
  const span = high - low;
  const innerWidth = width - pad * 2;
  const innerHeight = height - pad * 2;
  const step = finite.length === 1 ? 0 : innerWidth / (finite.length - 1);
  return finite.map((value, index) => ({
    x: finite.length === 1 ? width / 2 : pad + index * step,
    y: span === 0 ? height / 2 : pad + innerHeight - ((value - low) / span) * innerHeight,
  }));
}

/** An SVG path through the points, rounded to two decimals so the markup stays small. */
export function sparkPath(points: readonly SparkPoint[]): string {
  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(' ');
}

export interface SparklineProps {
  values: readonly number[];
  /** Text alternative: what the line shows and its latest value. */
  label: string;
  width?: number;
  height?: number;
  tone?: SparklineTone;
  className?: string;
}

/** A word-sized trend line. It draws itself once when first seen and marks the latest value. */
export function Sparkline({
  values,
  label,
  width = 96,
  height = 28,
  tone = 'ink',
  className,
}: SparklineProps) {
  const ref = useRef<SVGSVGElement>(null);
  const { drawn, reduced } = useDrawn(ref);
  const points = sparkPoints(values, width, height, 3);
  const last = points[points.length - 1];
  const look = TONE[tone];
  return (
    <svg
      ref={ref}
      role="img"
      aria-label={label}
      width={width}
      height={height}
      viewBox={`0 0 ${String(width)} ${String(height)}`}
      className={cx('shrink-0 overflow-visible', className)}
    >
      {points.length > 1 && (
        <motion.path
          d={sparkPath(points)}
          fill="none"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={look.line}
          initial={{ pathLength: reduced ? 1 : 0 }}
          animate={{ pathLength: drawn ? 1 : 0 }}
          transition={SPRING.draw}
        />
      )}
      {last !== undefined && <circle cx={last.x} cy={last.y} r={2.75} className={look.dot} />}
    </svg>
  );
}
