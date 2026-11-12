import { CircleStop, Gauge, Pause, Play, RefreshCcw, VideoOff } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, ErrorNotice, Pill } from '../../ui';
import { formatMegabytes } from '../shotlab/format';
import type { GetDetector } from './detector';
import { drawOverlay, type OverlayLayers } from './draw';
import { EMPTY_FRAME, type OverlayFrame } from './model';
import type { ReadPixels } from './pixels';
import { CountsCard, LayersCard } from './Readout';
import { useOverlay, type OverlaySource } from './useOverlay';

export interface OverlaySession {
  readonly source: OverlaySource;
  /** A video the coach picked, or the address of the sample clip. Absent for the camera. */
  readonly file?: File | string;
}

export interface OverlayViewProps {
  readonly session: OverlaySession;
  readonly getDetector: GetDetector;
  readonly readPixels: ReadPixels;
  readonly onBack: () => void;
}

const ALL_LAYERS: OverlayLayers = { rings: true, numbers: true, trails: true };

/** The picture with the overlay drawn on it, the counts beside it and the layer switches. */
export function OverlayView({ session, getDetector, readPixels, onBack }: OverlayViewProps) {
  const { t, i18n } = useTranslation();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [aspect, setAspect] = useState(16 / 9);
  const [layers, setLayers] = useState<OverlayLayers>(ALL_LAYERS);
  const latest = useRef<{ frame: OverlayFrame; layers: OverlayLayers }>({
    frame: EMPTY_FRAME,
    layers: ALL_LAYERS,
  });

  const paint = useCallback(() => {
    const element = canvas.current;
    const ctx = element?.getContext('2d') ?? null;
    if (element === null || ctx === null) return;
    const { clientWidth: width, clientHeight: height } = element;
    // Sharp on a phone, but never more than twice the pixels: the rest is not visible.
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    if (element.width !== Math.round(width * ratio)) element.width = Math.round(width * ratio);
    if (element.height !== Math.round(height * ratio)) element.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    drawOverlay(ctx, latest.current.frame, width, height, latest.current.layers);
  }, []);

  const draw = useCallback(
    (frame: OverlayFrame) => {
      latest.current.frame = frame;
      paint();
    },
    [paint],
  );

  const { status, reading, startCamera, startFile, stop, togglePause, attachVideo } = useOverlay(
    getDetector,
    readPixels,
    draw,
  );

  const begin = useCallback(
    () => (session.file === undefined ? startCamera() : startFile(session.file)),
    [session, startCamera, startFile],
  );
  // Start as soon as the view opens: the coach chose the source on the previous screen.
  useEffect(() => {
    void begin();
  }, [begin]);

  // A switched layer shows at once, also on a paused video where no new frame will come.
  useEffect(() => {
    latest.current.layers = layers;
    paint();
  }, [layers, paint]);

  if (status.kind === 'error') {
    return (
      <div className="flex flex-col gap-4">
        <ErrorNotice
          title={t(`overlay.error.${status.reason}.title`)}
          body={t(`overlay.error.${status.reason}.body`)}
          onRetry={status.reason === 'video' ? onBack : () => void begin()}
        />
        <div>
          <Button variant="secondary" onClick={onBack}>
            {t('overlay.live.back')}
          </Button>
        </div>
      </div>
    );
  }

  const running = status.kind === 'running';
  const paused = running && status.paused;
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,4fr)] lg:items-start">
      <section aria-labelledby="overlay-live-title" className="flex min-w-0 flex-col gap-3">
        <h2 id="overlay-live-title" className="sr-only">
          {t('overlay.live.title')}
        </h2>
        <div className="flex min-h-11 flex-wrap items-center gap-2" aria-live="polite">
          {running && (
            <Pill tone={paused ? 'amber' : 'pitch'}>
              {t(
                paused
                  ? 'overlay.live.paused'
                  : status.source === 'camera'
                    ? 'overlay.live.cameraOn'
                    : 'overlay.live.playing',
              )}
            </Pill>
          )}
          {running && (
            <span className="inline-flex h-6 items-center gap-1.5 text-[13px] font-semibold text-ink-soft tabular-nums">
              <Gauge aria-hidden="true" size={16} />
              {t('overlay.live.fps', { count: reading.fps })}
            </span>
          )}
        </div>
        <div
          className="relative mx-auto w-full overflow-hidden rounded-card border border-line bg-mute-soft"
          style={{
            aspectRatio: String(aspect),
            maxHeight: '70dvh',
            maxWidth: `calc(70dvh * ${String(aspect)})`,
          }}
        >
          <video
            ref={attachVideo}
            muted
            playsInline
            aria-label={t('overlay.live.videoLabel')}
            className="absolute inset-0 size-full object-contain"
            onLoadedMetadata={(event) => {
              const { videoWidth, videoHeight } = event.currentTarget;
              if (videoWidth > 0 && videoHeight > 0) setAspect(videoWidth / videoHeight);
            }}
          />
          <canvas ref={canvas} aria-hidden="true" className="absolute inset-0 size-full" />
          {status.kind === 'starting' && (
            <p className="absolute inset-x-0 bottom-0 bg-ink/80 p-3 text-[15px] text-on-ink tabular-nums">
              {t('overlay.live.starting', {
                loaded: formatMegabytes(status.loaded, i18n.language),
                total: formatMegabytes(status.total, i18n.language),
              })}
            </p>
          )}
          {(status.kind === 'idle' || status.kind === 'hidden') && (
            <p className="absolute inset-0 grid place-content-center justify-items-center gap-2 p-4 text-center text-[15px] text-ink-soft">
              <VideoOff aria-hidden="true" size={28} />
              {t(status.kind === 'hidden' ? 'overlay.live.hidden' : 'overlay.live.stopped')}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {running && (
            <Button
              variant="danger"
              icon={<CircleStop />}
              onClick={() => {
                // Stop lets go of the camera or the file at once and goes back to the start.
                stop();
                onBack();
              }}
            >
              {t('overlay.live.stop')}
            </Button>
          )}
          {running && status.source === 'file' && (
            <Button variant="secondary" icon={paused ? <Play /> : <Pause />} onClick={togglePause}>
              {t(paused ? 'overlay.live.play' : 'overlay.live.pause')}
            </Button>
          )}
          {status.kind === 'hidden' && (
            <Button icon={<RefreshCcw />} onClick={() => void begin()}>
              {t('overlay.live.startAgain')}
            </Button>
          )}
          {!running && (
            <Button variant="ghost" onClick={onBack}>
              {t('overlay.live.back')}
            </Button>
          )}
        </div>
        <p className="text-[13px] text-ink-soft">{t('overlay.live.privacy')}</p>
      </section>
      <div className="flex min-w-0 flex-col gap-4">
        <CountsCard reading={reading} />
        <LayersCard
          layers={layers}
          onToggle={(key) => {
            setLayers((current) => ({ ...current, [key]: !current[key] }));
          }}
        />
      </div>
    </div>
  );
}
