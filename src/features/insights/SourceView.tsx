import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ErrorNotice, Skeleton } from '../../ui';
import type { Source } from './queries';

export interface SourceViewProps<Data> {
  readonly source: Source<Data>;
  readonly children: (data: Data) => ReactNode;
}

/** The loading and error states every view shares; the view only writes its success state. */
export function SourceView<Data>({ source, children }: SourceViewProps<Data>) {
  const { t } = useTranslation();
  if (source.status === 'error') {
    return (
      <ErrorNotice
        title={t('insights.error.title')}
        body={t('insights.error.body')}
        onRetry={source.retry}
      />
    );
  }
  if (source.status === 'loading') {
    return (
      <div role="status" aria-label={t('ui.loading')} className="flex flex-col gap-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  return <>{children(source.data)}</>;
}
