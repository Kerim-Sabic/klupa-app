import { useId } from 'react';
import type { MomentumState } from '../../engine';
import { STATE_STYLE } from './chartModel';

/** An id that is safe inside `url(#...)`, whatever characters React's ids contain. */
export function useSvgId(prefix: string): string {
  return `${prefix}-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
}

/** Diagonal hatch for "not enough evidence": readable without colour, in print and for CVD. */
export function HatchPattern({ id }: { readonly id: string }) {
  return (
    <pattern
      id={id}
      width={6}
      height={6}
      patternUnits="userSpaceOnUse"
      patternTransform="rotate(45)"
    >
      <rect width={6} height={6} className="fill-mute-soft" />
      <line x1={0} y1={0} x2={0} y2={6} className="stroke-mute" strokeWidth={2} />
    </pattern>
  );
}

/** Fill for one state's band: a token colour, or the hatch for `insufficient`. */
export function stateFill(
  state: MomentumState,
  hatchId: string,
): {
  readonly className: string;
  readonly fill?: string;
} {
  const style = STATE_STYLE[state];
  return style.hatched ? { className: '', fill: `url(#${hatchId})` } : { className: style.fill };
}

/** A small key that matches the conclusion strip exactly. Decorative: a label always follows. */
export function StateSwatch({ state }: { readonly state: MomentumState }) {
  const hatchId = useSvgId('swatch-hatch');
  const look = stateFill(state, hatchId);
  return (
    <svg aria-hidden="true" width={14} height={14} className="shrink-0">
      <defs>
        <HatchPattern id={hatchId} />
      </defs>
      <rect width={14} height={14} rx={3} {...look} />
    </svg>
  );
}
