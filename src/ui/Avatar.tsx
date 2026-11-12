import { cx } from './internal';

export type AvatarSize = 'sm' | 'md' | 'lg';

const SIZE: Record<AvatarSize, { box: string; text: string }> = {
  sm: { box: 'size-8', text: 'text-[13px]' },
  md: { box: 'size-10', text: 'text-[15px]' },
  lg: { box: 'size-14', text: 'text-[22px]' },
};

export interface AvatarProps {
  /** Shirt number. Players are a label and a number, never a photo (CLAUDE.md). */
  number: number;
  size?: AvatarSize;
  /**
   * Accessible name, for when the badge stands alone. Without it the badge is decorative and
   * the label next to it must say who this is.
   */
  label?: string;
  className?: string;
}

/*
 * A shirt reduced to its outline: shoulders, short sleeves and a round collar. Drawn in a 40-unit box so
 * the number sits in the chest at every size.
 */
const SHIRT =
  'M13 5.5 7 8.5 3 15l5.2 3.2L10 15.6V35h20V15.6l1.8 2.6L37 15l-4-6.5-6-3c-.9 2.3-3.6 3.9-7 3.9s-6.1-1.6-7-3.9Z';

/** A shirt-number badge: the one way a player is pictured in Klupa. */
export function Avatar({ number, size = 'md', label, className }: AvatarProps) {
  const look = SIZE[size];
  return (
    <span
      {...(label === undefined ? { 'aria-hidden': true } : { role: 'img', 'aria-label': label })}
      className={cx('relative inline-grid shrink-0 place-items-center', look.box, className)}
    >
      <svg viewBox="0 0 40 40" className="absolute inset-0 size-full" aria-hidden="true">
        <path
          d={SHIRT}
          className="fill-pitch-soft stroke-pitch/50"
          strokeWidth={1.4}
          strokeLinejoin="round"
        />
      </svg>
      <span
        className={cx(
          'font-display relative translate-y-[12%] leading-none text-ink tabular-nums',
          look.text,
        )}
      >
        {number}
      </span>
    </span>
  );
}
