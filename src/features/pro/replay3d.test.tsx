import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Vector3 } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { goalSequences, type SequenceStep } from '../../engine/pro';
import { FINAL_2018, loadMatch } from '../../test/proFixtures';
import { GoalReplay3D } from './GoalReplay3D';
import { ballAt, cameraFor, easeTowards, segmentsOf, toMetres } from './replay3d';

const camera = { position: new Vector3(), lookAt: vi.fn() };
const invalidate = vi.fn();
let frame: ((state: unknown, delta: number) => void) | null = null;

// No WebGL in jsdom: the canvas becomes a plain element and the frame loop is driven by hand.
vi.mock('@react-three/fiber', () => ({
  Canvas: ({ children }: { children: ReactNode }) => <div data-testid="canvas">{children}</div>,
  useThree: (pick: (state: { camera: typeof camera; invalidate: typeof invalidate }) => unknown) =>
    pick({ camera, invalidate }),
  useFrame: (callback: (state: unknown, delta: number) => void) => {
    frame = callback;
  },
}));

afterEach(() => {
  vi.restoreAllMocks();
  frame = null;
});

const sequences = goalSequences(loadMatch(FINAL_2018));
const perisic = sequences.find((s) => s.goal.scorer === 'I. Perišić');
const step = (overrides: Partial<SequenceStep>): SequenceStep => ({
  index: 0,
  kind: 'pass',
  player: 'A',
  t: 0,
  from: { x: 50, y: 50 },
  to: { x: 60, y: 50 },
  cross: false,
  header: false,
  ...overrides,
});

describe('replay3d', () => {
  it('puts the centre spot at the origin and ends a goal in the net', () => {
    expect(toMetres({ x: 50, y: 50 })).toMatchObject({ x: 0, z: 0 });
    const end = ballAt(perisic?.steps ?? [], 1);
    expect(end?.x).toBeCloseTo(-52.5, 6);
  });

  it('lifts a cross into an arc and keeps a short pass on the grass', () => {
    const cross = [step({ cross: true, from: { x: 80, y: 5 }, to: { x: 95, y: 50 } })];
    const pass = [step({})];
    expect(ballAt(cross, 0.5)?.y).toBeGreaterThan(3);
    expect(ballAt(pass, 0.5)?.y).toBeLessThan(0.3);
    const long = [step({ from: { x: 10, y: 50 }, to: { x: 60, y: 50 } })];
    expect(ballAt(long, 0.5)?.y).toBeGreaterThan(2);
    const shot = [
      step({ kind: 'shot', header: true, from: { x: 90, y: 50 }, to: { x: 100, y: 50 } }),
    ];
    expect(ballAt(shot, 0.5)?.y).toBeCloseTo(0.82, 2);
  });

  it('joins actions with a carry and handles empty or still routes', () => {
    const steps = [step({}), step({ index: 1, from: { x: 62, y: 50 }, to: { x: 70, y: 50 } })];
    expect(segmentsOf(steps)).toHaveLength(3);
    expect(ballAt([], 0.5)).toBeNull();
    expect(ballAt([step({ to: { x: 50, y: 50 } })], 0.5)).toMatchObject({ x: 0, z: 0 });
    expect(ballAt(steps, Number.NaN)?.x).toBeCloseTo(toMetres({ x: 70, y: 50 }).x, 6);
  });

  it('puts the camera behind the attack and eases towards it', () => {
    const ball = { x: 10, y: 0.2, z: 0 };
    expect(cameraFor(ball, 0).position.x).toBeLessThan(ball.x);
    expect(cameraFor(ball, 1).position.x).toBeGreaterThan(ball.x);
    expect(easeTowards({ x: 0, y: 0, z: 0 }, { x: 10, y: 10, z: 10 }, 0.5)).toEqual({
      x: 5,
      y: 5,
      z: 5,
    });
    expect(easeTowards({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, 3).x).toBe(10);
  });
});

describe('GoalReplay3D', () => {
  it('renders the scene and moves the camera each frame', () => {
    // React warns about three.js-only elements in the DOM; that is the mock, not the code.
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<GoalReplay3D steps={perisic?.steps ?? []} team={1} progress={0.5} reduced={false} />);
    expect(screen.getByTestId('canvas')).toBeInTheDocument();
    frame?.({}, 0.016);
    frame?.({}, 0.016);
    expect(camera.lookAt).toHaveBeenCalled();
    expect(invalidate).toHaveBeenCalled();
  });

  it('jumps the camera for reduced motion and draws nothing without a route', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<GoalReplay3D steps={[]} team={0} progress={1} reduced />);
    frame?.({}, 0.016);
    render(<GoalReplay3D steps={perisic?.steps ?? []} team={0} progress={1} reduced />);
    frame?.({}, 0.016);
    expect(camera.position.y).toBe(15);
  });
});
