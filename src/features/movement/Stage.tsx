import { useReducedMotionConfig } from 'motion/react';
import {
  Component,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import type { PathPoint, Tracking } from '../../engine/tracking';
import { Button, Spinner } from '../../ui';
import { useClubName } from './clubs';
import { formatNumber } from './format';
import type { Layers } from './LayerPanel';
import type { PlayerReadout, Readout } from './model';
import { Pitch2D } from './Pitch2D';
import { stageView } from './cameraFit';
import { CAMERA_PRESETS, orbitBy, type CameraPreset, type Orbit } from './pitch';
import { NIGHT } from './sceneParts';
import type { Playback } from './usePlayback';
import { useOrbitGestures } from './useOrbitGestures';
import { hasWebGL } from './webgl';

// three.js and react-three-fiber are only downloaded when the 3D view is about to show.
const Pitch3D = lazy(async () => ({ default: (await import('./Pitch3D')).Pitch3D }));

export { hasWebGL };

/** A lost or refused WebGL context falls back to the flat pitch instead of breaking the page. */
class ViewBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export interface StageProps {
  readonly tracking: Tracking;
  readonly playback: Playback;
  readonly readout: Readout;
  readonly layers: Layers;
  readonly selected: number | null;
  readonly onSelect: (slot: number) => void;
  readonly trail: readonly PathPoint[];
}

/** A whole pitch on a 360 px phone puts about 3 px in a metre: grow the markers to match. */
export const markerScaleFor = (widthPx: number) => Math.min(1.8, Math.max(1, 720 / widthPx));

const FOLLOW_SCALE = 1.15;

const widthOf = (element: HTMLElement | null) => element?.clientWidth || 640;

/**
 * The chosen player's shirt and speed, on the picture itself. Speed is the engine's reading
 * over the last second, shown in km/h as on a broadcast; the panel beside keeps m/s and the
 * distance, and is what a screen reader hears, so this is decoration to assistive technology.
 */
function PlayerChip({ player }: { readonly player: PlayerReadout }) {
  const { t, i18n } = useTranslation();
  const club = useClubName();
  return (
    <div
      aria-hidden="true"
      data-testid="player-chip"
      className="pointer-events-none absolute top-2 left-2 flex max-w-[70%] flex-col rounded-control px-3 py-2 tabular-nums"
      style={{ background: 'rgb(4 7 10 / 0.72)', color: NIGHT.ink }}
    >
      <span className="truncate text-[13px] font-semibold opacity-80">
        {t('movement.readout.playerName', { side: club(player.side), shirt: player.shirt })}
      </span>
      <span className="font-display text-[22px] leading-tight">
        {!player.onPitch
          ? t('movement.stage.chipOff')
          : player.speed === null
            ? t('movement.stage.chipUnknown')
            : t('movement.stage.chipSpeed', {
                value: formatNumber(player.speed * 3.6, 1, i18n.language),
              })}
      </span>
    </div>
  );
}

function Stage3D({ flat, ...props }: StageProps & { readonly flat: ReactNode }) {
  const { t } = useTranslation();
  const reduced = useReducedMotionConfig() === true;
  const surface = useRef<HTMLDivElement>(null);
  const [preset, setPreset] = useState<CameraPreset>('broadcast');
  const chosen = useRef<CameraPreset>('broadcast');
  const first = stageView('broadcast', 640, -1);
  const orbit = useRef<Orbit>(first.orbit);
  const [aspect, setAspect] = useState(first.aspect);
  const [markerScale, setMarkerScale] = useState(1);
  const [version, setVersion] = useState(0);
  const ballX = props.readout.frame.ball?.x ?? -1;

  const apply = useCallback((next: CameraPreset, end: 1 | -1) => {
    const view = stageView(next, widthOf(surface.current), end);
    orbit.current = view.orbit;
    setAspect(view.aspect);
    setMarkerScale(markerScaleFor(widthOf(surface.current)));
    setVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    const element = surface.current;
    if (element === null || typeof ResizeObserver !== 'function') return undefined;
    // Fit the camera, and the canvas shape, to the stage's real width (and refit on a turn).
    let width = 0;
    const observer = new ResizeObserver(() => {
      if (element.clientWidth === width) return;
      width = element.clientWidth;
      apply(chosen.current, orbit.current.targetX >= 0 ? 1 : -1);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [apply]);

  useOrbitGestures(surface, (dx, dy, zoom) => {
    orbit.current = orbitBy(orbit.current, dx, dy, zoom);
    setVersion((v) => v + 1);
  });

  return (
    <div className="flex flex-col gap-3">
      <div
        ref={surface}
        role="img"
        aria-label={t('movement.stage.label3d')}
        // A night match in both themes: dark before the first frame is drawn, too.
        style={{ aspectRatio: aspect.toFixed(3), background: NIGHT.sky }}
        className="relative w-full overflow-hidden rounded-card border border-hairline"
      >
        <ViewBoundary fallback={flat}>
          <Suspense
            fallback={
              <div className="grid size-full place-items-center">
                <div className="rounded-control bg-raised px-4 py-3">
                  <Spinner label={t('movement.stage.loading')} />
                </div>
              </div>
            }
          >
            <Pitch3D
              tracking={props.tracking}
              clock={props.playback.clock}
              tick={props.playback.time.seconds + props.playback.time.period * 1e5}
              playing={props.playback.playing}
              layers={props.layers}
              selected={props.selected}
              onSelect={props.onSelect}
              orbit={orbit}
              orbitVersion={version}
              follow={preset === 'follow'}
              reduced={reduced}
              // Enlarged to stay readable with the whole pitch in view; the follow camera
              // stands close, where life size is plenty.
              markerScale={preset === 'follow' ? Math.min(markerScale, FOLLOW_SCALE) : markerScale}
            />
          </Suspense>
        </ViewBoundary>
        {props.readout.player !== null && <PlayerChip player={props.readout.player} />}
      </div>
      {/* Short words that fit one line at 360 px; the full name is what is announced. */}
      <div role="group" aria-labelledby="movement-camera-label" className="flex flex-col gap-1.5">
        <span id="movement-camera-label" className="text-[13px] font-semibold text-ink-soft">
          {t('movement.stage.cameraLabel')}
        </span>
        <div className="grid grid-cols-4 gap-1">
          {CAMERA_PRESETS.map((value) => (
            <Button
              key={value}
              variant={preset === value ? 'primary' : 'secondary'}
              aria-pressed={preset === value}
              aria-label={t(`movement.stage.camera.${value}`)}
              onClick={() => {
                setPreset(value);
                chosen.current = value;
                apply(value, ballX >= 0 ? 1 : -1);
              }}
            >
              {t(`movement.stage.cameraShort.${value}`)}
            </Button>
          ))}
        </div>
      </div>
      <p className="text-[13px] text-ink-soft">
        {t('movement.stage.hint')} {t('movement.stage.sprintHint')}
      </p>
    </div>
  );
}

/**
 * The picture: the 3D replay where WebGL works, otherwise the flat pitch. Someone who asked
 * for reduced motion starts on the flat pitch and gets 3D once they press Play themselves.
 */
export function Stage(props: StageProps) {
  const { t } = useTranslation();
  const reduced = useReducedMotionConfig() === true;
  const [webgl] = useState(hasWebGL);
  const [opened, setOpened] = useState(!reduced);
  // Pressing Play is the request for motion: from then on the 3D view stays.
  if (props.playback.playing && !opened) setOpened(true);

  const flat = (
    <Pitch2D
      readout={props.readout}
      layers={props.layers}
      selected={props.selected}
      onSelect={props.onSelect}
      trail={props.trail}
      label={t('movement.stage.label2d')}
    />
  );
  const summary = t('movement.stage.summary', {
    clock: props.readout.clock,
    half: t(`movement.transport.period${String(props.playback.time.period)}`),
    players: props.readout.frame.players.length,
  });

  if (webgl && opened) {
    return (
      <div className="flex flex-col gap-2">
        <Stage3D {...props} flat={flat} />
        <p className="sr-only">{summary}</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {flat}
      <p className="text-[13px] text-ink-soft">
        {t(webgl ? 'movement.stage.flatReduced' : 'movement.stage.flatNoWebgl')} {summary}
      </p>
    </div>
  );
}
