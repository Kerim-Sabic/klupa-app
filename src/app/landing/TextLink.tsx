import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';

/** A quiet way onward: the words in the brand colour, with a chevron. */
export function TextLink({ to, children }: { readonly to: string; readonly children: ReactNode }) {
  return (
    <Link
      to={to}
      className="inline-flex min-h-11 items-center gap-0.5 rounded-control text-[17px] font-medium text-pitch underline-offset-4 hover:underline"
    >
      {children}
      <ChevronRight aria-hidden="true" size={18} strokeWidth={2.2} />
    </Link>
  );
}
