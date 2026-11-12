import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { SURFACE, cx } from './internal';

export interface ListGroupProps {
  /** Accessible name of the list, when no visible heading names it. */
  label?: string;
  /** Id of the heading that names it. */
  labelledBy?: string;
  className?: string;
  children: ReactNode;
}

/**
 * An inset group of rows on one card, divided by hairlines that start where the text starts,
 * the way a settings list is drawn. Holds `ListRow`s.
 */
export function ListGroup({ label, labelledBy, className, children }: ListGroupProps) {
  return (
    <ul
      aria-label={label}
      aria-labelledby={labelledBy}
      className={cx('overflow-hidden rounded-card', SURFACE, className)}
    >
      {children}
    </ul>
  );
}

export type ListRowTone = 'ink' | 'pitch' | 'amber' | 'clay' | 'seen' | 'effort';

const ICON_TONE: Record<ListRowTone, string> = {
  ink: 'bg-mute-soft text-ink',
  pitch: 'bg-pitch-soft text-pitch',
  amber: 'bg-amber-soft text-amber',
  clay: 'bg-clay-soft text-clay',
  seen: 'bg-ring-seen/12 text-ring-seen',
  effort: 'bg-ring-effort/12 text-ring-effort',
};

export interface ListRowProps {
  title: string;
  /** A second line under the title. */
  detail?: ReactNode;
  /** A short value on the right, before the chevron (a count, a date). */
  value?: ReactNode;
  icon?: ReactNode;
  tone?: ListRowTone;
  /** Where the row leads. Without it the row is plain content. */
  to?: string;
  /** Accessible name when the visible title alone would be ambiguous. */
  label?: string;
}

/**
 * The standard tappable row: icon tile, title, detail, value and a chevron. The whole row is
 * the target (at least 56 px tall); the chevron only says "this goes somewhere".
 */
export function ListRow({ title, detail, value, icon, tone = 'ink', to, label }: ListRowProps) {
  const body = (
    <>
      {icon !== undefined && (
        <span
          aria-hidden="true"
          className={cx(
            'grid size-9 shrink-0 place-items-center rounded-[10px] [&>svg]:size-[19px]',
            ICON_TONE[tone],
          )}
        >
          {icon}
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col py-3">
        <span className="text-[16px] leading-snug font-semibold text-ink">{title}</span>
        {detail !== undefined && (
          <span className="mt-0.5 text-footnote text-pretty text-ink-soft">{detail}</span>
        )}
      </span>
      {value !== undefined && (
        <span className="shrink-0 text-[15px] text-ink-soft tabular-nums">{value}</span>
      )}
      {to !== undefined && (
        <ChevronRight
          aria-hidden="true"
          size={18}
          strokeWidth={2.4}
          className="-mr-1 shrink-0 text-mute transition-transform duration-120 ease-touch group-hover:translate-x-0.5"
        />
      )}
    </>
  );
  // The divider starts where the text starts, so the icon column reads as one quiet edge.
  const frame = cx(
    'relative flex min-h-14 items-center gap-3 px-4',
    'after:absolute after:right-0 after:bottom-0 after:h-px after:bg-hairline',
    icon === undefined ? 'after:left-4' : 'after:left-16',
  );
  return (
    <li className="group [&:last-child>*]:after:hidden">
      {to === undefined ? (
        <div className={frame}>{body}</div>
      ) : (
        <Link
          to={to}
          aria-label={label}
          className={cx(
            frame,
            'no-underline transition-colors duration-120 ease-touch hover:bg-mute-soft/60 active:bg-mute-soft focus-visible:-outline-offset-3',
          )}
        >
          {body}
        </Link>
      )}
    </li>
  );
}
