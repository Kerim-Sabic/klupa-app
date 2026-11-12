import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { BufferGeometry, Line, LineBasicMaterial, Vector3 } from 'three';
import type { SequenceStep, TeamIndex } from '../../engine/pro';
import { useSceneColors } from '../movement/Pitch3D';
import { FOV_DEGREES } from '../movement/pitch';
import type { SceneColors } from '../movement/scene';
import { buildPitch, disposeAll } from '../movement/sceneParts';
import { PITCH_M } from './ProPitch';
import { ballAt, cameraFor, easeTowards, type Vec3 } from './replay3d';

/** Samples along the route for the trail behind the ball. */
const TRAIL_SAMPLES = 120;

interface Replay3DProps {
  readonly steps: readonly SequenceStep[];
  readonly team: TeamIndex;
  /** Shared with the flat view's transport, 0 to 1. */
  readonly progress: number;
  readonly reduced: boolean;
}

function Scene({
  steps,
  team,
  progress,
  reduced,
  colors,
}: Replay3DProps & { readonly colors: SceneColors }) {
  const pitch = useMemo(() => buildPitch(PITCH_M.length, PITCH_M.width, colors), [colors]);
  const trail = useMemo(
    () =>
      new Line(
        new BufferGeometry(),
        new LineBasicMaterial({ color: team === 0 ? colors.home : colors.away }),
      ),
    [colors, team],
  );
  useEffect(
    () => () => {
      disposeAll([pitch]);
      trail.geometry.dispose();
      trail.material.dispose();
    },
    [pitch, trail],
  );
  useEffect(() => {
    const points: Vector3[] = [];
    for (let i = 0; i <= TRAIL_SAMPLES; i += 1) {
      const share = (i / TRAIL_SAMPLES) * progress;
      const p = ballAt(steps, share);
      if (p !== null) points.push(new Vector3(p.x, p.y, p.z));
    }
    trail.geometry.setFromPoints(points);
  }, [steps, progress, trail]);

  const ball = ballAt(steps, progress);
  const camera = useThree((state) => state.camera);
  const invalidate = useThree((state) => state.invalidate);
  const eye = useRef<Vec3 | null>(null);
  const latest = useRef(ball);
  useEffect(() => {
    latest.current = ball;
    invalidate();
  });

  useFrame((_, delta) => {
    const now = latest.current;
    if (now === null) return;
    const want = cameraFor(now, team);
    const from = eye.current ?? want.position;
    const next = reduced
      ? want.position
      : easeTowards(from, want.position, 1 - Math.exp(-Math.min(delta, 0.1) * 3));
    eye.current = next;
    camera.position.set(next.x, next.y, next.z);
    camera.lookAt(want.target.x, want.target.y, want.target.z);
    if (Math.hypot(next.x - want.position.x, next.z - want.position.z) > 0.05) invalidate();
  });

  return (
    <>
      <hemisphereLight args={['#ffffff', '#88998f', 1.6]} />
      <directionalLight position={[-30, 60, 40]} intensity={1.4} />
      <primitive object={pitch} />
      <primitive object={trail} />
      {ball !== null && (
        <mesh position={[ball.x, ball.y, ball.z]}>
          <sphereGeometry args={[0.55, 24, 16]} />
          <meshStandardMaterial color="#ffffff" roughness={0.4} />
        </mesh>
      )}
    </>
  );
}

/**
 * The same build-up in 3D: the ball flies along the route, with an arc on crosses, shots and
 * long balls, and the camera eases along behind the attack. Loaded only when asked for, with
 * three.js; the flat view stays the text alternative.
 */
export function GoalReplay3D(props: Replay3DProps) {
  const colors = useSceneColors();
  return (
    <div className="aspect-[16/10] overflow-hidden rounded-control bg-pitch-soft">
      <Canvas
        frameloop="demand"
        dpr={[1, 2]}
        flat
        camera={{ fov: FOV_DEGREES, near: 1, far: 600 }}
        aria-hidden="true"
      >
        <Scene {...props} colors={colors} />
      </Canvas>
    </div>
  );
}
