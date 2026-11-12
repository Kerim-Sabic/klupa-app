import type { ReactNode } from 'react';
import { cx } from './internal';

export interface LargeTitleProps {
  title: string;
  /** A short line above the title, such as today's date. */
  eyebrow?: string;
  subtitle?: ReactNode;
  /** Buttons that belong to the whole page. They wrap under the title on a phone. */
  actions?: ReactNode;
  className?: string;
}

/**
 * The page's one `<h1>`, set large and confident: the slightly condensed title cut, tight
 * tracking, and balanced lines so a long Bosnian title never leaves one word on its own.
 */
export function LargeTitle({ title, eyebrow, subtitle, actions, className }: LargeTitleProps) {
  return (
    <div
      className={cx(
        'flex flex-wrap items-end justify-between gap-x-6 gap-y-4 [&>*]:min-w-0',
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow !== undefined && (
          <p className="pb-1 text-[15px] font-semibold text-ink-soft">{eyebrow}</p>
        )}
        <h1 className="font-title text-large-title text-balance text-ink sm:text-[48px]">
          {title}
        </h1>
        {subtitle !== undefined && (
          <p className="mt-2 max-w-prose text-[17px] text-pretty text-ink-soft">{subtitle}</p>
        )}
      </div>
      {actions !== undefined && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
