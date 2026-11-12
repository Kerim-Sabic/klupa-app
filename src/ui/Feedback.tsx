import { CircleAlert, RotateCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from './Button';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  body?: string;
  action?: ReactNode;
}

/** Nothing here yet, said plainly, with the one thing the coach can do about it. */
export function EmptyState({ icon, title, body, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center rounded-card border border-dashed border-line bg-raised/50 px-6 py-12 text-center">
      {icon !== undefined && (
        <span
          aria-hidden="true"
          className="mb-4 grid size-14 place-items-center rounded-[18px] bg-pitch-soft text-pitch [&>svg]:size-7"
        >
          {icon}
        </span>
      )}
      <p className="text-headline font-semibold text-balance text-ink">{title}</p>
      {body !== undefined && (
        <p className="mt-1 max-w-[38ch] text-[15px] text-pretty text-ink-soft">{body}</p>
      )}
      {action !== undefined && <div className="mt-5">{action}</div>}
    </div>
  );
}

export interface ErrorNoticeProps {
  title: string;
  body?: string;
  onRetry?: () => void;
}

/** Something failed. Says what, and offers a retry when one can help. Announced on arrival. */
export function ErrorNotice({ title, body, onRetry }: ErrorNoticeProps) {
  const { t } = useTranslation();
  return (
    <div role="alert" className="flex gap-3 rounded-card border border-clay/35 bg-clay-soft p-4">
      <CircleAlert
        aria-hidden="true"
        size={20}
        strokeWidth={2.25}
        className="mt-0.5 shrink-0 text-clay"
      />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-ink">{title}</p>
        {body !== undefined && <p className="mt-0.5 text-[15px] text-ink-soft">{body}</p>}
        {onRetry !== undefined && (
          <Button variant="secondary" icon={<RotateCw />} onClick={onRetry} className="mt-3">
            {t('ui.retry')}
          </Button>
        )}
      </div>
    </div>
  );
}
