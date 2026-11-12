import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { PRESS, cx } from './internal';

export interface SectionHeaderProps {
  title: string;
  /** Heading level to fit the page outline. Defaults to `h2`. */
  as?: 'h2' | 'h3';
  /** Id for the heading, so a section can be `aria-labelledby` it. */
  id?: string;
  /** Short supporting line under the title. */
  detail?: ReactNode;
  /** A "see all" style link on the right. */
  action?: { to: string; label: string };
  className?: string;
}

/** The title of a group of content: a headline, an optional line under it, an optional link. */
export function SectionHeader({
  title,
  as: Tag = 'h2',
  id,
  detail,
  action,
  className,
}: SectionHeaderProps) {
  return (
    <div className={cx('flex items-end justify-between gap-4 pb-3', className)}>
      <div className="min-w-0">
        <Tag id={id} className="font-title text-title text-balance text-ink">
          {title}
        </Tag>
        {detail !== undefined && (
          <p className="mt-0.5 text-footnote text-pretty text-ink-soft">{detail}</p>
        )}
      </div>
      {action !== undefined && (
        <Link
          to={action.to}
          className={cx(
            '-mr-2 inline-flex min-h-11 shrink-0 items-center gap-0.5 rounded-control px-2 text-[15px] font-semibold text-pitch hover:bg-pitch-soft',
            PRESS,
          )}
        >
          {action.label}
          <ChevronRight aria-hidden="true" size={18} strokeWidth={2.4} />
        </Link>
      )}
    </div>
  );
}
