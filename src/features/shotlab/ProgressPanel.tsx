import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button, Card } from '../../ui';
import { MAX_SECONDS } from './analyseVideo';
import { formatMegabytes } from './format';

export interface ProgressPanelProps {
  readonly phase: 'loading-model' | 'analysing';
  readonly done: number;
  readonly total: number;
  readonly videoUrl: string | null;
  readonly attachVideo: (node: HTMLVideoElement | null) => void;
  readonly onCancel: () => void;
}

/**
 * Model download, then frame-by-frame analysis. The clip is shown while it is read, so
 * the coach can see it is their video being stepped through, here, on this device.
 */
export function ProgressPanel({
  phase,
  done,
  total,
  videoUrl,
  attachVideo,
  onCancel,
}: ProgressPanelProps) {
  const { t, i18n } = useTranslation();
  const share = total > 0 ? Math.min(1, done / total) : 0;
  const percent = Math.round(share * 100);
  const loading = phase === 'loading-model';
  const detail = loading
    ? t('shotlab.progress.modelDetail', {
        loaded: formatMegabytes(done, i18n.language),
        total: formatMegabytes(total, i18n.language),
      })
    : t('shotlab.progress.framesDetail', { done, total, seconds: MAX_SECONDS });

  return (
    <Card
      as="section"
      aria-labelledby="shotlab-progress-title"
      className="mx-auto flex w-full max-w-xl flex-col gap-4"
    >
      <h2 id="shotlab-progress-title" className="text-[17px] font-semibold text-ink">
        {t(loading ? 'shotlab.progress.modelTitle' : 'shotlab.progress.framesTitle')}
      </h2>
      {videoUrl !== null && (
        <video
          ref={attachVideo}
          src={videoUrl}
          muted
          playsInline
          preload="auto"
          aria-label={t('shotlab.stage.videoLabel')}
          className="aspect-video w-full rounded-control bg-ink object-contain"
        />
      )}
      <div
        role="progressbar"
        aria-labelledby="shotlab-progress-title"
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
      <p className="text-[15px] text-ink-soft tabular-nums" aria-live="polite">
        {detail}
      </p>
      {loading && <p className="text-[13px] text-ink-soft">{t('shotlab.progress.modelOnce')}</p>}
      <div>
        <Button variant="secondary" icon={<X />} onClick={onCancel}>
          {t('shotlab.progress.cancel')}
        </Button>
      </div>
    </Card>
  );
}
