import { useTranslation } from 'react-i18next';
import { errorKey } from '../../lib/errors';
import { ErrorNotice, Skeleton } from '../../ui';

/** Placeholder rows while a screen loads, announced once as a status. */
export function LoadingBlock({ rows = 3 }: { rows?: number }) {
  const { t } = useTranslation();
  return (
    <div role="status" className="flex flex-col gap-3">
      <span className="sr-only">{t('ui.loading')}</span>
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-14 w-full rounded-card" />
      ))}
    </div>
  );
}

/** Says what failed, why in plain words, and offers a retry. */
export function QueryFailed({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { t } = useTranslation();
  return <ErrorNotice title={t('errors.loadFailed')} body={t(errorKey(error))} onRetry={onRetry} />;
}

/** A quiet explanation of why a screen is read-only for this role. */
export function ReadOnlyNote({ children }: { children: string }) {
  return (
    <p className="rounded-control border border-line bg-mute-soft px-4 py-3 text-[15px] text-ink-soft">
      {children}
    </p>
  );
}
