import { useTranslation } from 'react-i18next';
import { Card } from '../../ui';
import { formatMegabytes } from './format';

/** The match download, with its real byte progress. */
export function LoadingPanel({
  loaded,
  total,
}: {
  readonly loaded: number;
  readonly total: number;
}) {
  const { t, i18n } = useTranslation();
  const percent = total > 0 ? Math.round(Math.min(1, loaded / total) * 100) : 0;
  const detail = t('movement.loading.detail', {
    loaded: formatMegabytes(loaded, i18n.language),
    total: formatMegabytes(total, i18n.language),
  });
  return (
    <Card
      as="section"
      aria-labelledby="movement-loading-title"
      className="mx-auto flex w-full max-w-xl flex-col gap-4"
    >
      <h2 id="movement-loading-title" className="text-headline font-semibold text-ink">
        {t('movement.loading.title')}
      </h2>
      <div
        role="progressbar"
        aria-labelledby="movement-loading-title"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={detail}
        className="h-3 overflow-hidden rounded-full bg-mute-soft"
      >
        <div
          className="h-full rounded-full bg-pitch motion-safe:transition-[width] motion-safe:duration-120 motion-safe:ease-touch"
          style={{ width: `${String(percent)}%` }}
        />
      </div>
      <p className="text-[15px] text-ink-soft tabular-nums">{detail}</p>
      <p className="text-[13px] text-ink-soft">{t('movement.loading.once')}</p>
    </Card>
  );
}
