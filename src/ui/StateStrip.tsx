import { motion } from 'motion/react';
import { useRef } from 'react';
import type { MomentumState } from '../engine';
import { useDrawn } from './Ring';
import { EASE, cx } from './internal';

/** One stretch of a match in which the same conclusion held. Times in any unit, from 0. */
export interface StateSegment {
  from: number;
  to: number;
  state: MomentumState;
}

/**
 * The same colours as the momentum charts and the state badges (DESIGN.md, "colour is a
 * claim"). `insufficient` is a hatch, so "nothing to read" never depends on telling grey apart.
 */
const BAND: Record<MomentumState, string> = {
  stable: 'bg-pitch',
  'event-sensitive': 'bg-amber',
  'window-sensitive': 'bg-clay',
  level: 'bg-mute',
  insufficient:
    'bg-mute-soft bg-[repeating-linear-gradient(135deg,var(--color-mute)_0_1.5px,transparent_1.5px_5px)]',
};

export interface StateStripProps {
  segments: readonly StateSegment[];
  /** Length of the whole match on the same scale as the segments. */
  total: number;
  /** Text alternative: what the strip says, in words (the caller knows the language). */
  label: string;
  /** Positions on the same scale where a new period starts; drawn as thin gaps. */
  breaks?: readonly number[];
  className?: string;
}

/** Width of a span as a percentage of the whole, never negative and never past the end. */
export function spanPercent(from: number, to: number, total: number): number {
  if (!(total > 0)) return 0;
  const start = Math.min(Math.max(from, 0), total);
  const end = Math.min(Math.max(to, start), total);
  return ((end - start) / total) * 100;
}

/**
 * A thin bar of the match, coloured by what a coach could conclude at each moment. It wipes in
 * from the kick-off side once, the first time it is seen.
 */
export function StateStrip({ segments, total, label, breaks = [], className }: StateStripProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { drawn, reduced } = useDrawn(ref);
  const hidden = 'inset(0 100% 0 0 round 999px)';
  const shown = 'inset(0 0% 0 0 round 999px)';
  return (
    <div ref={ref} role="img" aria-label={label} className={cx('relative h-2.5', className)}>
      <motion.div
        aria-hidden="true"
        className="absolute inset-0 flex overflow-hidden rounded-full bg-mute-soft"
        initial={{ clipPath: reduced ? shown : hidden }}
        animate={{ clipPath: drawn ? shown : hidden }}
        transition={{ duration: 0.7, ease: EASE }}
      >
        {segments.map((segment) => (
          <span
            key={`${String(segment.from)}-${segment.state}`}
            className={cx('h-full shrink-0', BAND[segment.state])}
            style={{ width: `${String(spanPercent(segment.from, segment.to, total))}%` }}
          />
        ))}
      </motion.div>
      {breaks.map((at) => (
        <span
          key={at}
          aria-hidden="true"
          className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-raised"
          style={{ left: `${String(spanPercent(0, at, total))}%` }}
        />
      ))}
    </div>
  );
}
