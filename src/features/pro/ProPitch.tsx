import type { ReactNode } from 'react';
import type { Point } from '../../engine/pro';
import { pitchMarkings } from '../movement/pitch';

/** The pitch the provider's percentages are read on, in metres. */
export const PITCH_M = { length: 105, width: 68 } as const;
const MARKINGS = pitchMarkings(PITCH_M.length, PITCH_M.width);
const MARGIN = 2;

/** A point in percent (0-100, y from the attacking team's left, drawn at the top) to SVG metres. */
export function toPitch(point: Point): Point {
  return {
    x: (point.x / 100 - 0.5) * PITCH_M.length,
    y: (point.y / 100 - 0.5) * PITCH_M.width,
  };
}

/** Where a percent position sits inside the drawing, as CSS percentages for HTML overlays. */
export function overlayPosition(point: Point): { readonly left: string; readonly top: string } {
  const w = PITCH_M.length + 2 * MARGIN;
  const h = PITCH_M.width + 2 * MARGIN;
  const p = toPitch(point);
  return {
    left: `${String(((p.x + w / 2) / w) * 100)}%`,
    top: `${String(((p.y + h / 2) / h) * 100)}%`,
  };
}

/**
 * A landscape pitch from above, drawn with the same markings as the movement replay. Children
 * draw in metres with the centre spot at 0,0; `toPitch` converts the provider's percentages.
 */
export function ProPitch({
  label,
  children,
  overlay,
}: {
  readonly label: string;
  readonly children?: ReactNode;
  /** HTML laid over the drawing (labels and buttons that must keep their real size). */
  readonly overlay?: ReactNode;
}) {
  const w = PITCH_M.length + 2 * MARGIN;
  const h = PITCH_M.width + 2 * MARGIN;
  return (
    <div className="relative">
      <svg
        viewBox={`${String(-w / 2)} ${String(-h / 2)} ${String(w)} ${String(h)}`}
        role="img"
        aria-label={label}
        className="block h-auto w-full rounded-control bg-pitch-soft"
      >
        <g className="fill-none stroke-pitch/45" strokeWidth={0.35} strokeLinejoin="round">
          {MARKINGS.lines.map((line, i) => (
            <polyline
              key={i}
              points={line.map((p) => `${p.x.toFixed(2)},${(-p.y).toFixed(2)}`).join(' ')}
            />
          ))}
        </g>
        {MARKINGS.spots.map((spot, i) => (
          <circle key={i} cx={spot.x} cy={-spot.y} r={0.45} className="fill-pitch/45" />
        ))}
        {children}
      </svg>
      {overlay}
    </div>
  );
}
