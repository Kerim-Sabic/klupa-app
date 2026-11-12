import type { ReactNode } from 'react';

/** One question on the match screen: a heading, an optional line under it, the answer. */
export function Section({
  id,
  title,
  intro,
  className,
  children,
}: {
  readonly id: string;
  readonly title: string;
  readonly intro?: string;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className={`flex min-w-0 flex-col gap-3 ${className ?? ''}`}>
      <div>
        <h2 id={id} className="font-title text-title text-balance text-ink">
          {title}
        </h2>
        {intro !== undefined && (
          <p className="mt-1 max-w-prose text-[15px] text-pretty text-ink-soft">{intro}</p>
        )}
      </div>
      {children}
    </section>
  );
}
