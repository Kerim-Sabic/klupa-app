import { ChevronLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { LargeTitle } from './LargeTitle';
import { PRESS, cx } from './internal';

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  back?: { to: string; label: string };
  actions?: ReactNode;
  /**
   * On a phone, set the title in body size on the same row as the way back. For screens used
   * one-handed in a hurry, where a large title would push the controls off the screen.
   */
  compact?: boolean;
}

/** The top of every page: an optional way back, the page's one `<h1>`, and its actions. */
export function PageHeader({ title, subtitle, back, actions, compact }: PageHeaderProps) {
  const way = back !== undefined && (
    <Link
      to={back.to}
      className={cx(
        '-ml-2 inline-flex min-h-11 shrink-0 items-center gap-0.5 rounded-control px-2 font-semibold text-pitch hover:bg-pitch-soft',
        compact === true ? 'md:self-start' : 'self-start',
        PRESS,
      )}
    >
      <ChevronLeft aria-hidden="true" size={22} strokeWidth={2.4} />
      {back.label}
    </Link>
  );
  if (compact === true) {
    return (
      <header className="flex items-center justify-between gap-3 pb-2 md:flex-col md:items-stretch md:gap-2 md:pb-6">
        {way}
        <h1 className="min-w-0 truncate text-headline font-semibold text-ink md:overflow-visible md:font-title md:text-[44px] md:leading-[1.04] md:tracking-[-0.022em] md:text-balance md:whitespace-normal">
          {title}
        </h1>
      </header>
    );
  }
  return (
    <header className="flex flex-col gap-2 pb-7">
      {way}
      <LargeTitle
        title={title}
        {...(subtitle !== undefined && { subtitle })}
        {...(actions !== undefined && { actions })}
      />
    </header>
  );
}
