import { motion, useReducedMotionConfig } from 'motion/react';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { SPRING, cx } from './internal';

export type RingTone = 'fair' | 'seen' | 'effort';

/** Stroke classes per tone; the track is the same hue, faint, so an empty ring still reads. */
export const RING_TONE: Record<RingTone, { arc: string; track: string; tile: string }> = {
  fair: { arc: 'stroke-ring-fair', track: 'stroke-ring-fair/14', tile: 'bg-ring-fair' },
  seen: { arc: 'stroke-ring-seen', track: 'stroke-ring-seen/14', tile: 'bg-ring-seen' },
  effort: { arc: 'stroke-ring-effort', track: 'stroke-ring-effort/14', tile: 'bg-ring-effort' },
};

/** A share in [0, 1]; anything else (NaN, negative, above one) is pinned to the nearest end. */
export function clampShare(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * True once the element has been at least 40% on screen, and from then on. Without
 * IntersectionObserver (old browsers, jsdom) everything counts as seen, so nothing stays empty.
 */
export function useSeenOnce(ref: RefObject<Element | null>): boolean {
  const [seen, setSeen] = useState(() => typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    const element = ref.current;
    if (seen || element === null) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setSeen(true);
          observer.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [ref, seen]);
  return seen;
}

/** Whether a chart should show its values now; at once when the coach asked for less motion. */
export function useDrawn(ref: RefObject<Element | null>): { drawn: boolean; reduced: boolean } {
  const reduced = useReducedMotionConfig() === true;
  const seen = useSeenOnce(ref);
  return { drawn: reduced || seen, reduced };
}

export interface RingArcProps {
  centre: number;
  radius: number;
  thickness: number;
  /** Share in [0, 1], or null when there is nothing to measure yet (track only, dashed). */
  value: number | null;
  tone: RingTone;
  drawn: boolean;
  reduced: boolean;
  /** Seconds to wait before sweeping, so stacked rings arrive one after another. */
  delay?: number;
}

/**
 * One arc on its track, starting at twelve o'clock and running clockwise. It sweeps from empty
 * to its value once, the first time it is seen, on the `draw` spring; it never loops.
 */
export function RingArc({
  centre,
  radius,
  thickness,
  value,
  tone,
  drawn,
  reduced,
  delay = 0,
}: RingArcProps) {
  const look = RING_TONE[tone];
  const share = value === null ? 0 : clampShare(value);
  const target = drawn ? share : 0;
  return (
    <g transform={`rotate(-90 ${String(centre)} ${String(centre)})`}>
      <circle
        cx={centre}
        cy={centre}
        r={radius}
        fill="none"
        strokeWidth={thickness}
        className={look.track}
        {...(value === null && {
          strokeDasharray: `${String(thickness * 0.2)} ${String(thickness * 0.9)}`,
        })}
      />
      {value !== null && share > 0 && (
        <motion.circle
          cx={centre}
          cy={centre}
          r={radius}
          fill="none"
          strokeWidth={thickness}
          strokeLinecap="round"
          className={look.arc}
          initial={{ pathLength: reduced ? share : 0 }}
          animate={{ pathLength: target }}
          transition={{ ...SPRING.draw, delay }}
        />
      )}
    </g>
  );
}

export interface RingProps {
  /** Share in [0, 1]; null when nothing has been recorded that the ring could measure. */
  value: number | null;
  label: string;
  /** The value as words, for example "82%" or "No data yet". */
  valueText: string;
  tone?: RingTone;
  /** Diameter in px. */
  size?: number;
  className?: string;
}

/**
 * A single ring with its value in the middle and its label under it. The figure is one image
 * to assistive tech, named "label: value", so colour and shape are never the only cue.
 */
export function Ring({ value, label, valueText, tone = 'fair', size = 96, className }: RingProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { drawn, reduced } = useDrawn(ref);
  const thickness = Math.max(6, Math.round(size * 0.11));
  const centre = size / 2;
  return (
    <div
      ref={ref}
      role="img"
      aria-label={`${label}: ${valueText}`}
      className={cx('inline-flex flex-col items-center gap-2', className)}
    >
      <span className="relative grid place-items-center" style={{ width: size, height: size }}>
        <svg
          aria-hidden="true"
          width={size}
          height={size}
          viewBox={`0 0 ${String(size)} ${String(size)}`}
          className="absolute inset-0"
        >
          <RingArc
            centre={centre}
            radius={(size - thickness) / 2}
            thickness={thickness}
            value={value}
            tone={tone}
            drawn={drawn}
            reduced={reduced}
          />
        </svg>
        <span aria-hidden="true" className="font-display text-[22px] text-ink tabular-nums">
          {valueText}
        </span>
      </span>
      <span aria-hidden="true" className="text-footnote font-semibold text-ink-soft">
        {label}
      </span>
    </div>
  );
}
