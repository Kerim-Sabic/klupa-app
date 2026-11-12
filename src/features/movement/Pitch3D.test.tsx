import { act, fireEvent, render } from '@testing-library/react';
import { createRef, useRef, type ReactNode } from 'react';
import { Vector3 } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { orbitPosition, presetOrbit } from './pitch';
import { makeAtlas, Pitch3D, useSceneColors } from './Pitch3D';
import { shippedTracking } from './testTracking';
import type { ClockTime } from './usePlayback';
import { useOrbitGestures } from './useOrbitGestures';

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

const real = shippedTracking();

afterEach(() => {
  vi.restoreAllMocks();
  frame = null;
});

function scene(reduced: boolean, playing = false, follow = false) {
  // React warns about three.js-only elements in the DOM; that is the mock, not the code.
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  const clock: { current: ClockTime } = { current: { period: 1, seconds: 300 } };
  const orbit = { current: presetOrbit('tactical', 16 / 9) };
  render(
    <Pitch3D
      tracking={real}
      clock={clock}
      tick={300}
      playing={playing}
      layers={{ shape: true, space: true, trail: true }}
      selected={3}
      onSelect={vi.fn()}
      orbit={orbit}
      orbitVersion={0}
      follow={follow}
      reduced={reduced}
      markerScale={1.5}
    />,
  );
  return orbit;
}

describe('Pitch3D', () => {
  it('jumps the camera to its goal when motion is reduced', () => {
    const orbit = scene(true);
    act(() => frame?.({}, 1 / 60));
    const [x, y, z] = orbitPosition(orbit.current);
    expect(camera.position.toArray().map((v) => Math.round(v))).toEqual(
      [x, y, z].map((v) => Math.round(v)),
    );
    expect(camera.lookAt).toHaveBeenCalled();
  });

  it('glides towards a new goal and keeps asking for frames while it moves or plays', () => {
    const orbit = scene(false, true);
    act(() => frame?.({}, 1 / 60));
    orbit.current = presetOrbit('goal', 16 / 9, 1);
    invalidate.mockClear();
    act(() => frame?.({}, 1 / 60));
    const [gx] = orbitPosition(orbit.current);
    expect(camera.position.x).toBeLessThan(gx);
    expect(invalidate).toHaveBeenCalled();
  });

  it('keeps its aim on the ball with the follow camera, catching up over several frames', () => {
    const orbit = scene(false, true, true);
    orbit.current = presetOrbit('follow', 16 / 9);
    camera.lookAt.mockClear();
    act(() => frame?.({}, 1 / 60));
    const first = camera.lookAt.mock.lastCall as [number, number, number];
    for (let i = 0; i < 600; i += 1) act(() => frame?.({}, 1 / 60));
    const last = camera.lookAt.mock.lastCall as [number, number, number];
    // Five minutes into the first half the ball is not on the centre spot.
    expect(Math.hypot(last[0], last[2])).toBeGreaterThan(1);
    expect(Math.abs(last[0])).toBeLessThanOrEqual(34);
    expect(Math.abs(last[2])).toBeLessThanOrEqual(12);
    expect(last[1]).toBe(0);
    expect(first[1]).toBe(0);
  });

  it('draws no number atlas without a 2D canvas', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    expect(makeAtlas(['9'])).toBeNull();
  });

  it('draws every shirt number into one grid of cells', () => {
    const calls: string[] = [];
    const context = {
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      fillText: (text: string) => calls.push(text),
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      context as unknown as CanvasRenderingContext2D,
    );
    const atlas = makeAtlas(Array.from({ length: 19 }, (_, i) => String(i + 1)));
    expect(atlas?.columns).toBe(8);
    expect(atlas?.rows).toBe(3);
    expect(calls).toHaveLength(19);
    expect(context.arc).toHaveBeenCalledTimes(19);
  });
});

describe('useSceneColors', () => {
  it('reads the page colours, with the ground beyond the lines as green as the pitch', () => {
    function Probe() {
      const colors = useSceneColors();
      return <p data-testid="colors">{[colors.sky, colors.grass, colors.head].join(' ')}</p>;
    }
    const listeners: (() => void)[] = [];
    vi.stubGlobal('matchMedia', () => ({
      addEventListener: (_: string, listener: () => void) => listeners.push(listener),
      removeEventListener: vi.fn(),
    }));
    const { getByTestId, unmount } = render(<Probe />);
    expect(getByTestId('colors').textContent).toBe('#e2f1e9 #e2f1e9 #12161c');
    document.documentElement.style.setProperty('--color-pitch-soft', '#0f2e1b');
    act(() => {
      for (const listener of listeners) listener();
    });
    expect(getByTestId('colors').textContent).toBe('#0f2e1b #0f2e1b #12161c');
    document.documentElement.style.removeProperty('--color-pitch-soft');
    unmount();
    vi.unstubAllGlobals();
  });
});

function Surface({ onChange }: { onChange: (dx: number, dy: number, zoom: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useOrbitGestures(ref, onChange);
  return <div ref={ref} data-testid="surface" />;
}

describe('useOrbitGestures', () => {
  const touch = (x: number, y: number) => ({ clientX: x, clientY: y });

  it('turns only with Ctrl or Cmd held, and zooms only with Ctrl and the wheel', () => {
    const onChange = vi.fn();
    const { getByTestId } = render(<Surface onChange={onChange} />);
    const surface = getByTestId('surface');
    surface.setPointerCapture = vi.fn();
    fireEvent.pointerDown(surface, { pointerType: 'mouse', clientX: 0, clientY: 0 });
    fireEvent.pointerMove(surface, { clientX: 20, clientY: 0 });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.pointerDown(surface, { pointerType: 'mouse', ctrlKey: true, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(surface, { clientX: 20, clientY: 5 });
    expect(onChange).toHaveBeenLastCalledWith(20, 5, 1);
    fireEvent.pointerUp(surface);
    fireEvent.pointerMove(surface, { clientX: 40, clientY: 5 });
    expect(onChange).toHaveBeenCalledTimes(1);
    fireEvent.wheel(surface, { deltaY: 100 });
    expect(onChange).toHaveBeenCalledTimes(1);
    fireEvent.wheel(surface, { deltaY: 100, ctrlKey: true });
    expect(onChange.mock.lastCall?.[2]).toBeGreaterThan(1);
  });

  it('leaves one finger to the page and turns or pinches with two', () => {
    const onChange = vi.fn();
    const { getByTestId } = render(<Surface onChange={onChange} />);
    const surface = getByTestId('surface');
    fireEvent.pointerDown(surface, { pointerType: 'touch', ctrlKey: true });
    fireEvent.touchStart(surface, { touches: [touch(0, 0)] });
    fireEvent.touchMove(surface, { touches: [touch(0, 50)] });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.touchStart(surface, { touches: [touch(0, 0), touch(100, 0)] });
    fireEvent.touchMove(surface, { touches: [touch(10, 10), touch(110, 10)] });
    expect(onChange).toHaveBeenLastCalledWith(10, 10, 1);
    fireEvent.touchMove(surface, { touches: [touch(10, 10), touch(210, 10)] });
    expect(onChange.mock.lastCall?.[2]).toBeCloseTo(0.5);
    fireEvent.touchEnd(surface, { touches: [touch(10, 10)] });
    fireEvent.touchMove(surface, { touches: [touch(10, 10)] });
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('does nothing without an element', () => {
    function Detached() {
      useOrbitGestures(createRef<HTMLDivElement>(), vi.fn());
      return null;
    }
    expect(() => render(<Detached />)).not.toThrow();
  });
});
