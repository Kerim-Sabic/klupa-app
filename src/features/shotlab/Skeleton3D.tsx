import { Canvas, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { Quaternion, Vector3 } from 'three';
import type { Foot, Point3 } from '../../engine/pose';
import { ankleIndex, isKickingBone } from './draw';
import { POSE_BONES } from './skeleton';
import { useTokens } from './useTokens';

export interface View {
  readonly azimuth: number;
  readonly elevation: number;
  readonly distance: number;
}

export interface Skeleton3DProps {
  readonly poses: readonly (readonly Point3[])[];
  readonly index: number;
  readonly foot: Foot | null;
  readonly trail: readonly [number, number] | null;
  readonly view: View;
}

const JOINTS = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32];
const UP = new Vector3(0, 1, 0);

/** MediaPipe world (+y down, z towards the camera negative) to three.js (+y up), feet on y = 0. */
function toScene(p: Point3, ground: number): Vector3 {
  return new Vector3(p.x, ground - p.y, -p.z);
}

function CameraRig({ view, target }: { readonly view: View; readonly target: Vector3 }) {
  const camera = useThree((state) => state.camera);
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    const flat = Math.cos(view.elevation) * view.distance;
    camera.position.set(
      target.x + Math.sin(view.azimuth) * flat,
      target.y + Math.sin(view.elevation) * view.distance,
      target.z + Math.cos(view.azimuth) * flat,
    );
    camera.lookAt(target);
    invalidate();
  }, [camera, invalidate, target, view]);
  return null;
}

function Bone({
  from,
  to,
  color,
  radius,
}: {
  from: Vector3;
  to: Vector3;
  color: string;
  radius: number;
}) {
  const { position, quaternion, length } = useMemo(() => {
    const direction = to.clone().sub(from);
    const size = direction.length();
    return {
      position: from.clone().add(to).multiplyScalar(0.5),
      quaternion: new Quaternion().setFromUnitVectors(UP, size === 0 ? UP : direction.normalize()),
      length: size,
    };
  }, [from, to]);
  return (
    <mesh position={position} quaternion={quaternion} scale={[1, length, 1]}>
      <cylinderGeometry args={[radius, radius, 1, 10]} />
      <meshStandardMaterial color={color} roughness={0.6} />
    </mesh>
  );
}

/**
 * The analysed skeleton in 3D: joints and bones, the kicking leg in pitch green, a
 * ground grid and the path of the kicking foot. Rendering is on demand only: nothing
 * animates unless the coach scrubs, plays or moves the view.
 */
export function Skeleton3D({ poses, index, foot, trail, view }: Skeleton3DProps) {
  const colors = useTokens();
  const ground = useMemo(
    () => Math.max(...poses.flatMap((pose) => [29, 30, 31, 32].map((i) => pose[i]?.y ?? 0))),
    [poses],
  );
  const points = useMemo(
    () => (poses[index] ?? poses[0] ?? []).map((p) => toScene(p, ground)),
    [poses, index, ground],
  );
  const target = useMemo(() => new Vector3(0, ground * 0.75, 0), [ground]);
  const path = useMemo(() => {
    if (trail === null || foot === null) return [];
    return poses.slice(trail[0], trail[1] + 1).flatMap((p) => {
      const ankle = p[ankleIndex(foot)];
      return ankle === undefined ? [] : [toScene(ankle, ground)];
    });
  }, [foot, ground, poses, trail]);

  return (
    <Canvas
      frameloop="demand"
      dpr={[1, 2]}
      camera={{ fov: 40, near: 0.05, far: 50 }}
      aria-hidden="true"
    >
      <CameraRig view={view} target={target} />
      <ambientLight intensity={0.7} />
      <directionalLight position={[2, 4, 3]} intensity={1.2} />
      <gridHelper args={[4, 16, colors.inkSoft, colors.line]} />
      {POSE_BONES.map(([a, b]) => {
        const from = points[a];
        const to = points[b];
        if (from === undefined || to === undefined) return null;
        const kicking = isKickingBone(a, b, foot);
        return (
          <Bone
            key={`${String(a)}-${String(b)}`}
            from={from}
            to={to}
            color={kicking ? colors.pitch : colors.inkSoft}
            radius={kicking ? 0.028 : 0.02}
          />
        );
      })}
      {JOINTS.map((i) => {
        const p = points[i];
        if (p === undefined) return null;
        return (
          <mesh key={i} position={p}>
            <sphereGeometry args={[i === 0 ? 0.09 : 0.032, 16, 12]} />
            <meshStandardMaterial color={colors.ink} roughness={0.5} />
          </mesh>
        );
      })}
      {path.map((p, i) => (
        <mesh key={`trail-${String(i)}`} position={p}>
          <sphereGeometry args={[0.018, 10, 8]} />
          <meshStandardMaterial
            color={colors.amber}
            transparent
            opacity={0.25 + (0.75 * (i + 1)) / path.length}
          />
        </mesh>
      ))}
    </Canvas>
  );
}
