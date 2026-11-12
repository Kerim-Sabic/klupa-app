import { RotateCcw, RotateCw, Scan, ZoomIn, ZoomOut } from 'lucide-react';
import {
  Component,
  lazy,
  Suspense,
  useEffect,
  useId,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Spinner } from '../../ui';
import type { Skeleton3DProps, View } from './Skeleton3D';

// three.js and react-three-fiber are only downloaded when a result is on screen.
const Skeleton3D = lazy(async () => ({ default: (await import('./Skeleton3D')).Skeleton3D }));

const DEFAULT_VIEW: View = { azimuth: 0.6, elevation: 0.25, distance: 3.4 };

const clampDistance = (d: number) => Math.max(1.4, Math.min(8, d));
const clampElevation = (e: number) => Math.max(-0.1, Math.min(1.45, e));
const zoom = (factor: number) => (v: View) => ({
  ...v,
  distance: clampDistance(v.distance * factor),
});
const turn = (by: number) => (v: View) => ({ ...v, azimuth: v.azimuth + by });

/** Can this browser draw WebGL at all? */
function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) !== null;
  } catch {
    return false;
  }
}

/** A lost or refused WebGL context must not take the rest of the result down with it. */
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

export interface SkeletonPanelProps extends Omit<Skeleton3DProps, 'view'> {
  /** What the 3D view shows at the strike, in words, for anyone who cannot see it. */
  readonly summary: string;
}

/**
 * The interactive 3D view: drag to orbit, pinch or wheel to zoom. Every gesture also
 * has a labelled button, so the view works from a keyboard or a switch as well.
 */
export function SkeletonPanel({ summary, ...scene }: SkeletonPanelProps) {
  const { t } = useTranslation();
  const summaryId = useId();
  const [view, setView] = useState<View>(DEFAULT_VIEW);
  const [webgl] = useState(hasWebGL);
  const surface = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());

  useEffect(() => {
    const element = surface.current;
    if (element === null) return undefined;
    // Plain scrolling must keep scrolling the page; a trackpad pinch arrives as a wheel event
    // with ctrlKey set, and Ctrl or Cmd with the wheel zooms. React's listener is passive, so
    // this one is added by hand to be allowed to stop the page from zooming instead.
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      setView(zoom(Math.exp(event.deltaY * 0.0015)));
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      element.removeEventListener('wheel', onWheel);
    };
  }, []);

  const spread = () => {
    const [a, b] = [...pointers.current.values()];
    return a === undefined || b === undefined ? 0 : Math.hypot(a.x - b.x, a.y - b.y);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const previous = pointers.current.get(event.pointerId);
    if (previous === undefined) return;
    const before = spread();
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size >= 2) {
      const after = spread();
      if (before > 0 && after > 0) setView(zoom(before / after));
      return;
    }
    const dx = event.clientX - previous.x;
    const dy = event.clientY - previous.y;
    setView((v) => ({
      ...turn(-dx * 0.01)(v),
      elevation: clampElevation(v.elevation + dy * 0.01),
    }));
  };

  const release = (event: PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
  };

  const fallback = (
    <p className="p-4 text-[15px] text-ink-soft">{t('shotlab.view3d.unavailable')}</p>
  );
  const controls = [
    { key: 'left', icon: <RotateCcw />, label: t('shotlab.view3d.turnLeft'), change: turn(0.3) },
    { key: 'right', icon: <RotateCw />, label: t('shotlab.view3d.turnRight'), change: turn(-0.3) },
    { key: 'in', icon: <ZoomIn />, label: t('shotlab.view3d.zoomIn'), change: zoom(0.8) },
    { key: 'out', icon: <ZoomOut />, label: t('shotlab.view3d.zoomOut'), change: zoom(1.25) },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div
        ref={surface}
        role="img"
        aria-label={t('shotlab.view3d.label')}
        aria-describedby={summaryId}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        }}
        onPointerMove={onPointerMove}
        onPointerUp={release}
        onPointerCancel={release}
        className="relative aspect-square max-h-[60dvh] w-full cursor-grab touch-none overflow-hidden rounded-card border border-line bg-raised active:cursor-grabbing sm:aspect-[4/3]"
      >
        {webgl ? (
          <ViewBoundary fallback={fallback}>
            <Suspense
              fallback={
                <div className="grid size-full place-items-center">
                  <Spinner label={t('shotlab.view3d.loading')} />
                </div>
              }
            >
              <Skeleton3D {...scene} view={view} />
            </Suspense>
          </ViewBoundary>
        ) : (
          fallback
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {controls.map((control) => (
          <Button
            key={control.key}
            variant="secondary"
            aria-label={control.label}
            icon={control.icon}
            onClick={() => {
              setView(control.change);
            }}
          />
        ))}
        <Button
          variant="secondary"
          icon={<Scan />}
          onClick={() => {
            setView(DEFAULT_VIEW);
          }}
        >
          {t('shotlab.view3d.reset')}
        </Button>
      </div>
      <p className="text-[13px] text-ink-soft">{t('shotlab.view3d.hint')}</p>
      <p id={summaryId} className="text-[15px] text-ink">
        {summary}
      </p>
    </div>
  );
}
