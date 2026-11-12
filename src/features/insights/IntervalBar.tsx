import { useId } from 'react';

export interface IntervalBarProps {
  /** The adjusted rate, 0 to 1. */
  readonly point: number;
  /** The credible interval around it, or null when none can be drawn. */
  readonly interval: { readonly lower: number; readonly upper: number } | null;
  /** The reading in words, for assistive technology. */
  readonly description: string;
}

const WIDTH = 100;
const MARK = 3;

/**
 * A rate on a 0-100% scale: a bar for the range it plausibly sits in and a mark for the adjusted
 * rate. A wide bar is the point of it: little has been observed. The same words are in the cell.
 */
export function IntervalBar({ point, interval, description }: IntervalBarProps) {
  const titleId = useId();
  const at = (share: number): number => Math.min(WIDTH, Math.max(0, share * WIDTH));
  const markX = Math.min(WIDTH - MARK / 2, Math.max(MARK / 2, at(point)));
  return (
    <svg
      role="img"
      aria-labelledby={titleId}
      viewBox={`0 0 ${String(WIDTH)} 16`}
      className="h-4 w-28 shrink-0"
    >
      <title id={titleId}>{description}</title>
      <line x1={0} x2={WIDTH} y1={8} y2={8} className="stroke-line" strokeWidth={2} />
      {interval !== null && (
        <rect
          x={at(interval.lower)}
          y={4}
          width={Math.max(1, at(interval.upper) - at(interval.lower))}
          height={8}
          rx={2}
          className="fill-home/45"
        />
      )}
      <rect x={markX - MARK / 2} y={1} width={MARK} height={14} rx={1} className="fill-ink" />
    </svg>
  );
}
