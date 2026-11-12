import { cx } from './internal';

/**
 * The Klupa mark: a park bench seen from the front, reduced to a few strokes (two backrest
 * slats, the seat, two posts, two splayed legs) on a
 * pitch-green tile. Geometry lives here once; `public/icons/*.svg` draw the same strokes.
 * Exported so the icon script and the tests can check the two never drift apart.
 */
export const MARK_STROKES = [
  { d: 'M9.5 9H22.5M9.5 12.75H22.5', width: 2.2 },
  { d: 'M6.5 18H25.5', width: 3 },
  { d: 'M11.25 9V18M20.75 9V18', width: 2 },
  { d: 'M9.5 18L8.5 24M22.5 18L23.5 24', width: 2.6 },
] as const;

export interface KlupaMarkProps {
  /** Edge length in px. */
  size?: number;
  /** Accessible name. Without it the mark is decorative (the word "Klupa" sits beside it). */
  title?: string;
  className?: string;
}

/** The app's mark as an inline SVG tile. */
export function KlupaMark({ size = 28, title, className }: KlupaMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={cx('shrink-0', className)}
      {...(title === undefined ? { 'aria-hidden': true } : { role: 'img', 'aria-label': title })}
    >
      <rect width={32} height={32} rx={8} className="fill-pitch" />
      {MARK_STROKES.map((stroke) => (
        <path
          key={stroke.d}
          d={stroke.d}
          fill="none"
          strokeWidth={stroke.width}
          strokeLinecap="round"
          className="stroke-on-pitch"
        />
      ))}
    </svg>
  );
}
