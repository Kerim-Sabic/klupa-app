import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Vector3 } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { smoothPoses } from '../../engine/pose';
import { Skeleton3D } from './Skeleton3D';
import { synthesizeKick } from './synthetic';

const camera = { position: new Vector3(), lookAt: vi.fn() };
const invalidate = vi.fn();

// No WebGL in jsdom: render the scene graph as inert SVG-namespace elements instead, so the
// test can count what the component asks three.js to draw.
vi.mock('@react-three/fiber', () => ({
  Canvas: ({ children }: { children: ReactNode }) => <svg data-testid="canvas">{children}</svg>,
  useThree: (pick: (state: { camera: typeof camera; invalidate: typeof invalidate }) => unknown) =>
    pick({ camera, invalidate }),
}));

const poses = smoothPoses(synthesizeKick());

afterEach(() => {
  vi.restoreAllMocks();
});

function scene(props: Partial<Parameters<typeof Skeleton3D>[0]> = {}) {
  // React warns about three.js-only boolean props on SVG elements; that is the mock, not the code.
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  return render(
    <Skeleton3D
      poses={poses}
      index={39}
      foot="right"
      trail={[28, 45]}
      view={{ azimuth: 0, elevation: 0, distance: 3 }}
      {...props}
    />,
  );
}

describe('Skeleton3D', () => {
  it('draws every bone, every joint and the foot path, and aims the camera', () => {
    const { container } = scene();
    // 22 bones + 17 joints + 18 trail points.
    expect(container.querySelectorAll('mesh')).toHaveLength(22 + 17 + 18);
    expect(container.querySelectorAll('gridHelper')).toHaveLength(1);
    expect(camera.position.z).toBeCloseTo(3);
    expect(camera.lookAt).toHaveBeenCalled();
    expect(invalidate).toHaveBeenCalled();
  });

  it('highlights only the kicking leg', () => {
    const { container } = scene();
    const colours = [...container.querySelectorAll('meshStandardMaterial')].map((m) =>
      m.getAttribute('color'),
    );
    expect(colours.filter((c) => c === '#0f6b46')).toHaveLength(5);
  });

  it('draws no path and no highlight without a strike', () => {
    const { container } = scene({ foot: null, trail: null, index: 999 });
    expect(container.querySelectorAll('mesh')).toHaveLength(22 + 17);
  });
});
