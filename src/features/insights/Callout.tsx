import { Info } from 'lucide-react';
import type { ReactNode } from 'react';

/** A short, calm statement the coach should read before the numbers. */
export function Callout({ children }: { readonly children: ReactNode }) {
  return (
    <div
      role="note"
      className="flex gap-3 rounded-card border border-line bg-mute-soft p-4 text-[15px] text-ink"
    >
      <Info
        aria-hidden="true"
        size={20}
        strokeWidth={2.25}
        className="mt-0.5 shrink-0 text-ink-soft"
      />
      <p>{children}</p>
    </div>
  );
}
