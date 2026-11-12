import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { CanvasTexture, SRGBColorSpace } from 'three';
import type { Tracking } from '../../engine/tracking';
import type { NumberAtlas } from './figures';
import type { Layers } from './LayerPanel';
import {
  followAimX,
  followAimZ,
  FOV_DEGREES,
  glideOrbit,
  type MovingOrbit,
  type Orbit,
} from './pitch';
import { createReplayScene } from './scene';
import { NIGHT, type SceneColors } from './sceneParts';
import type { ClockTime } from './usePlayback';

export interface Pitch3DProps {
  readonly tracking: Tracking;
  readonly clock: RefObject<ClockTime>;
  /** Changes whenever React hears of a new clock value, so a paused scene redraws once. */
  readonly tick: number;
  readonly playing: boolean;
  readonly layers: Layers;
  readonly selected: number | null;
  readonly onSelect: (slot: number) => void;
  /** Where the camera should be; gestures and presets write it, the scene glides towards it. */
  readonly orbit: RefObject<Orbit>;
  readonly orbitVersion: number;
  /** Keep the camera's aim on the ball instead of on the orbit's own target. */
  readonly follow: boolean;
  readonly reduced: boolean;
  readonly markerScale: number;
}

const TOKENS = {
  grass: ['--color-pitch-soft', '#e2f1e9'],
  line: ['--color-pitch', '#0f6b46'],
  home: ['--color-home', '#1d4ed8'],
  away: ['--color-away', '#7c3aed'],
  ink: ['--color-ink', '#12161c'],
} as const;

function readColors(): SceneColors {
  const style = getComputedStyle(document.documentElement);
  const pick = (key: keyof typeof TOKENS) =>
    style.getPropertyValue(TOKENS[key][0]).trim() || TOKENS[key][1];
  const grass = pick('grass');
  return {
    // No night here: the ground beyond the lines is the same soft green as the pitch.
    sky: grass,
    grass,
    line: pick('line'),
    home: pick('home'),
    away: pick('away'),
    ink: pick('ink'),
    head: pick('ink'),
  };
}

/**
 * The design tokens as concrete colours for WebGL, re-read when the system theme flips. For
 * small diagrams drawn in the page's own colours (the goal replays of the pro matches); the
 * match replay itself is always the night scene.
 */
export function useSceneColors(): SceneColors {
  const [colors, setColors] = useState(readColors);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => {
      setColors(readColors());
    };
    query.addEventListener('change', update);
    return () => {
      query.removeEventListener('change', update);
    };
  }, []);
  return colors;
}

const CELL_PX = 96;
const ATLAS_COLUMNS = 8;

/**
 * Every shirt number drawn once into one texture: white figures on a dark disc, so a number
 * reads on either kit and on the grass. Null where there is no 2D canvas (tests).
 */
export function makeAtlas(labels: readonly string[]): NumberAtlas | null {
  const rows = Math.max(1, Math.ceil(labels.length / ATLAS_COLUMNS));
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_COLUMNS * CELL_PX;
  canvas.height = rows * CELL_PX;
  const context = canvas.getContext('2d');
  if (context === null) return null;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  labels.forEach((text, index) => {
    const x = (index % ATLAS_COLUMNS) * CELL_PX + CELL_PX / 2;
    const y = Math.floor(index / ATLAS_COLUMNS) * CELL_PX + CELL_PX / 2;
    context.beginPath();
    context.arc(x, y, CELL_PX * 0.42, 0, Math.PI * 2);
    context.fillStyle = 'rgba(8, 11, 14, 0.82)';
    context.fill();
    context.font = `800 ${String(text.length > 1 ? 46 : 54)}px Archivo, system-ui, sans-serif`;
    context.fillStyle = '#ffffff';
    context.fillText(text, x, y + 3);
  });
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return { texture, columns: ATLAS_COLUMNS, rows };
}

/** The camera's glide per second of wall time, and the slower one of its aim on the ball. */
const GLIDE = 6;
const AIM_GLIDE = 2.4;

function ReplayContent({ tracking, clock, onSelect, orbit, ...live }: Pitch3DProps) {
  const scene = useMemo(() => createReplayScene(tracking, NIGHT, makeAtlas), [tracking]);
  useEffect(
    () => () => {
      scene.dispose();
    },
    [scene],
  );
  const camera = useThree((state) => state.camera);
  const invalidate = useThree((state) => state.invalidate);
  const current = useRef<MovingOrbit | null>(null);
  // Read inside the frame loop, so changing a layer does not rebuild anything.
  const latest = useRef(live);
  useEffect(() => {
    latest.current = live;
    invalidate();
  });

  useFrame((_, delta) => {
    const { layers, selected, playing, reduced, markerScale, follow } = latest.current;
    const { period, seconds } = clock.current;
    scene.update({ period, seconds, layers, selected, markerScale, delta });
    const goal = orbit.current;
    let aimX = goal.targetX;
    let aimZ = goal.targetZ;
    if (follow && scene.ball.visible) {
      aimX = followAimX(scene.ball.position.x);
      aimZ = followAimZ(scene.ball.position.z);
    }
    const now = (current.current ??= { ...goal, targetX: aimX, targetZ: aimZ });
    const dt = Math.min(delta, 0.1);
    const settled = reduced
      ? glideOrbit(now, goal, 1, aimX, aimZ)
      : glideOrbit(
          now,
          goal,
          1 - Math.exp(-dt * GLIDE),
          aimX,
          aimZ,
          1 - Math.exp(-dt * (follow ? AIM_GLIDE : GLIDE)),
        );
    const flat = Math.cos(now.elevation) * now.distance;
    camera.position.set(
      now.targetX + Math.sin(now.azimuth) * flat,
      Math.sin(now.elevation) * now.distance,
      now.targetZ + Math.cos(now.azimuth) * flat,
    );
    camera.lookAt(now.targetX, 0, now.targetZ);
    if (playing || !settled) invalidate();
  });

  return (
    <>
      <color attach="background" args={[NIGHT.sky]} />
      {/* Floodlights: cool light from above, a warm fill off the grass, two masts for shape. */}
      <hemisphereLight args={['#eaf1ff', '#2c6a41', 1.7]} />
      <directionalLight position={[-40, 70, 45]} intensity={1.5} />
      <directionalLight position={[45, 60, -40]} intensity={0.6} />
      <primitive object={scene.root} />
      <primitive
        object={scene.players}
        onClick={(event: ThreeEvent<MouseEvent>) => {
          // Every instanced mesh under the players keeps instance n for roster slot n.
          const slot = event.instanceId;
          if (slot === undefined) return;
          event.stopPropagation();
          onSelect(slot);
        }}
      />
    </>
  );
}

/**
 * The 3D replay. Loaded lazily with three.js; React renders it when a setting changes, and
 * every animation frame only moves objects that already exist (see `scene.ts`). The canvas
 * draws on demand: continuously while playing or while the camera glides, otherwise once.
 * The device pixel ratio is capped at 2: a phone with a 3x screen would shade twice the
 * pixels for a picture nobody can tell apart.
 */
export function Pitch3D(props: Pitch3DProps) {
  return (
    <Canvas
      frameloop="demand"
      dpr={[1, 2]}
      flat
      camera={{ fov: FOV_DEGREES, near: 1, far: 2400 }}
      aria-hidden="true"
    >
      <ReplayContent {...props} />
    </Canvas>
  );
}
