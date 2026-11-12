/**
 * Shared, non-exported building blocks of the UI kit: class joining and the motion tokens
 * from docs/DESIGN.md, expressed once so every component moves the same way.
 */

export function cx(...parts: readonly (string | false | null | undefined)[]): string {
  return parts.filter((part): part is string => typeof part === 'string' && part !== '').join(' ');
}

/** `cubic-bezier(0.2, 0.8, 0.2, 1)`, the `ease-touch` token. */
export const EASE: [number, number, number, number] = [0.2, 0.8, 0.2, 1];

/** Durations in seconds, as motion expects them. */
export const DURATION = { quick: 0.12, base: 0.22, slow: 0.42, draw: 0.9 } as const;

/**
 * The three springs of the product. Every spring is critically damped or close to it: things
 * arrive and stop, they never wobble, because a wobble reads as a toy and delays a tap.
 * - `snappy`: thumbs and toggles that follow a tap (segmented control, tab highlight).
 * - `settle`: content arriving (cards, toasts, sheets).
 * - `draw`: data being drawn (rings, sparklines), slow enough to be read as it fills.
 */
export const SPRING = {
  snappy: { type: 'spring', stiffness: 520, damping: 42, mass: 0.9 },
  settle: { type: 'spring', stiffness: 260, damping: 30, mass: 1 },
  draw: { type: 'spring', stiffness: 70, damping: 18, mass: 1, restDelta: 0.0005 },
} as const;

/** Delay between siblings that arrive together, in seconds, and how many may wait. */
export const STAGGER = { step: 0.04, cap: 6 } as const;

/** Press feedback shared by every tappable surface: a quick 0.97 scale, off when disabled. */
export const PRESS =
  'transition-[transform,background-color,border-color,color,opacity,box-shadow] duration-120 ease-touch active:scale-[0.97] active:duration-75 disabled:active:scale-100';

/** The surface recipe for cards: a raised tile resting on the page, with no edge of its own. */
export const SURFACE = 'bg-raised shadow-card';
