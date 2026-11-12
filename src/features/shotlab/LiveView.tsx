import { CircleStop, Footprints, Gauge, RefreshCcw, SwitchCamera, VideoOff } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, CardTitle, ErrorNotice, Pill } from '../../ui';
import type { ImagePoint } from './detector';
import { drawSkeleton, imageToCanvas } from './draw';
import { formatMegabytes } from './format';
import type { CaughtStrike } from './liveModel';
import { LiveReadout } from './LiveReadout';
import { useLiveCamera, type GetDetector } from './useLiveCamera';
import { useTokens } from './useTokens';

export interface LiveViewProps {
  readonly getDetector: GetDetector;
  readonly onSeeStrike: (caught: CaughtStrike) => void;
  readonly onBack: () => void;
}

/** Live camera: the skeleton over the picture, a small readout, and any strike it catches. */
export function LiveView({ getDetector, onSeeStrike, onBack }: LiveViewProps) {
  const { t, i18n } = useTranslation();
  const colors = useTokens();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [aspect, setAspect] = useState(4 / 3);

  const draw = useCallback(
    (image: readonly ImagePoint[] | null) => {
      const element = canvas.current;
      const ctx = element?.getContext('2d') ?? null;
      if (element === null || ctx === null) return;
      const { clientWidth: width, clientHeight: height } = element;
      const ratio = window.devicePixelRatio || 1;
      if (element.width !== Math.round(width * ratio)) element.width = Math.round(width * ratio);
      if (element.height !== Math.round(height * ratio))
        element.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, width, height);
      if (image === null) return;
      const points = imageToCanvas(image, width, height);
      drawSkeleton(ctx, points, { colors, foot: null, lineWidth: Math.max(3, width / 160) });
    },
    [colors],
  );

  const { status, reading, caught, facing, canSwitch, start, stop, switchCamera, attachVideo } =
    useLiveCamera(getDetector, draw);

  // Start as soon as the view opens: the coach asked for the camera on the previous screen.
  useEffect(() => {
    void start();
  }, [start]);

  if (status.kind === 'error') {
    return (
      <div className="flex flex-col gap-4">
        <ErrorNotice
          title={t(`shotlab.live.error.${status.reason}.title`)}
          body={t(`shotlab.live.error.${status.reason}.body`)}
          onRetry={() => void start()}
        />
        <div>
          <Button variant="secondary" onClick={onBack}>
            {t('shotlab.live.back')}
          </Button>
        </div>
      </div>
    );
  }

  const running = status.kind === 'running';
  const mirrored = facing === 'user';
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-start">
      <section aria-labelledby="shotlab-live-title" className="flex flex-col gap-3">
        <h2 id="shotlab-live-title" className="sr-only">
          {t('shotlab.live.title')}
        </h2>
        <div className="flex min-h-11 flex-wrap items-center gap-2" aria-live="polite">
          {running && (
            <span className="inline-flex h-8 items-center gap-2 rounded-full bg-clay-soft px-3 text-[15px] font-semibold text-ink">
              <span aria-hidden="true" className="size-2.5 rounded-full bg-clay" />
              {t('shotlab.live.cameraOn')}
            </span>
          )}
          {running && (
            <Pill tone={reading.tracking ? 'pitch' : 'amber'}>
              {t(reading.tracking ? 'shotlab.live.tracking' : 'shotlab.live.lost')}
            </Pill>
          )}
          {running && (
            <span className="inline-flex h-6 items-center gap-1.5 text-[13px] font-semibold text-ink-soft tabular-nums">
              <Gauge aria-hidden="true" size={16} />
              {t('shotlab.live.fps', { fps: reading.fps })}
            </span>
          )}
        </div>
        <div
          className="relative mx-auto w-full overflow-hidden rounded-card border border-line bg-mute-soft"
          style={{
            aspectRatio: String(aspect),
            maxHeight: '65dvh',
            maxWidth: `calc(65dvh * ${String(aspect)})`,
          }}
        >
          <video
            ref={attachVideo}
            muted
            playsInline
            aria-label={t('shotlab.live.videoLabel')}
            className={`absolute inset-0 size-full object-contain ${mirrored ? '-scale-x-100' : ''}`}
            onLoadedMetadata={(event) => {
              const { videoWidth, videoHeight } = event.currentTarget;
              if (videoWidth > 0 && videoHeight > 0) setAspect(videoWidth / videoHeight);
            }}
          />
          <canvas
            ref={canvas}
            aria-hidden="true"
            className={`absolute inset-0 size-full ${mirrored ? '-scale-x-100' : ''}`}
          />
          {status.kind === 'starting' && (
            <p className="absolute inset-x-0 bottom-0 bg-ink/80 p-3 text-[15px] text-on-ink tabular-nums">
              {t('shotlab.live.starting', {
                loaded: formatMegabytes(status.loaded, i18n.language),
                total: formatMegabytes(status.total, i18n.language),
              })}
            </p>
          )}
          {(status.kind === 'idle' || status.kind === 'hidden') && (
            <p className="absolute inset-0 grid place-content-center justify-items-center gap-2 p-4 text-center text-[15px] text-ink-soft">
              <VideoOff aria-hidden="true" size={28} />
              {t(status.kind === 'hidden' ? 'shotlab.live.hidden' : 'shotlab.live.stopped')}
            </p>
          )}
        </div>
        {/* Always two lines tall, so the controls below never jump when tracking comes and goes. */}
        <p className="min-h-[3em] text-[15px] text-ink-soft">
          {running
            ? t(reading.tracking ? 'shotlab.live.trackingHint' : 'shotlab.live.lostHint')
            : ''}
        </p>
        <div className="flex flex-wrap gap-2">
          {running ? (
            <Button
              variant="danger"
              icon={<CircleStop />}
              onClick={() => {
                // Stop lets go of the camera at once and goes back to the start.
                stop();
                onBack();
              }}
            >
              {t('shotlab.live.stop')}
            </Button>
          ) : status.kind === 'starting' ? null : (
            <Button icon={<RefreshCcw />} onClick={() => void start()}>
              {t('shotlab.live.startAgain')}
            </Button>
          )}
          {running && canSwitch && (
            <Button variant="secondary" icon={<SwitchCamera />} onClick={switchCamera}>
              {t('shotlab.live.switch')}
            </Button>
          )}
          {!running && (
            <Button variant="ghost" onClick={onBack}>
              {t('shotlab.live.back')}
            </Button>
          )}
        </div>
      </section>
      <div className="flex flex-col gap-4">
        {caught !== null && (
          <Card as="section" aria-live="polite" className="flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <Footprints aria-hidden="true" size={24} className="mt-0.5 shrink-0 text-pitch" />
              <div>
                <CardTitle>{t(`shotlab.live.caught.${caught.analysis.foot}`)}</CardTitle>
                <p className="mt-1 text-[15px] text-ink-soft">{t('shotlab.live.caught.body')}</p>
              </div>
            </div>
            <Button
              onClick={() => {
                onSeeStrike(caught);
              }}
            >
              {t('shotlab.live.caught.see')}
            </Button>
          </Card>
        )}
        {reading.tooSlow && (
          <div className="flex flex-col gap-3">
            <ErrorNotice title={t('shotlab.live.slow.title')} body={t('shotlab.live.slow.body')} />
            <div>
              <Button variant="secondary" onClick={onBack}>
                {t('shotlab.live.slow.film')}
              </Button>
            </div>
          </div>
        )}
        <LiveReadout numbers={reading.numbers} tracking={reading.tracking} />
        <p className="text-[13px] text-ink-soft">{t('shotlab.live.privacy')}</p>
      </div>
    </div>
  );
}
