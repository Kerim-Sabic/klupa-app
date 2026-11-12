import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { smoothPoses } from '../../engine/pose';
import '../../i18n';
import type { DetectedFrame } from './detector';
import { exampleFrames } from './example';
import { useTokens } from './useTokens';
import { VideoStage } from './VideoStage';

const ctx = {
  setTransform: vi.fn(),
  clearRect: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  stroke: vi.fn(),
  arc: vi.fn(),
  fill: vi.fn(),
};

let resize: (width: number, height: number) => void = () => undefined;

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    ctx as unknown as CanvasRenderingContext2D,
  );
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(
        callback: (entries: { contentRect: { width: number; height: number } }[]) => void,
      ) {
        resize = (width, height) => {
          callback([{ contentRect: { width, height } }]);
        };
      }
      observe() {
        resize(320, 240);
      }
      disconnect() {
        resize = () => undefined;
      }
    },
  );
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const frames = exampleFrames();
const poses = smoothPoses(frames);

describe('VideoStage', () => {
  it('draws the example side-on with a ground line and the foot path', () => {
    render(
      <VideoStage
        frames={frames}
        poses={poses}
        index={39}
        videoUrl={null}
        foot="right"
        trail={[28, 39]}
      />,
    );
    expect(screen.getByRole('img', { name: /Side view of the skeleton/ })).toBeInTheDocument();
    expect(ctx.setTransform).toHaveBeenCalled();
    // Ground line + 22 bones (halo and colour) + head outline.
    expect(ctx.stroke.mock.calls.length).toBeGreaterThanOrEqual(1 + 44 + 1);
    expect(ctx.fill.mock.calls.length).toBeGreaterThanOrEqual(12);
  });

  it('draws the detected skeleton over a video and moves the video to the frame', () => {
    const withImage: DetectedFrame[] = frames.map((f) => ({
      ...f,
      image: Array.from({ length: 33 }, (_, i) => ({ x: i / 33, y: i / 33, visibility: 0.9 })),
    }));
    const { container, rerender } = render(
      <VideoStage
        frames={withImage}
        poses={[]}
        index={10}
        videoUrl="blob:clip"
        foot="left"
        trail={[0, 10]}
      />,
    );
    const video = container.querySelector('video');
    expect(video).toHaveAttribute('src', 'blob:clip');
    expect(video?.currentTime).toBeCloseTo(withImage[10]?.time ?? 0);
    Object.defineProperty(video, 'videoWidth', { value: 1080 });
    Object.defineProperty(video, 'videoHeight', { value: 1920 });
    act(() => {
      video?.dispatchEvent(new Event('loadedmetadata'));
    });
    expect(container.firstElementChild?.getAttribute('style')).toContain('aspect-ratio: 0.5625');
    rerender(
      <VideoStage
        frames={withImage}
        poses={[]}
        index={11}
        videoUrl="blob:clip"
        foot={null}
        trail={null}
      />,
    );
    expect(video?.currentTime).toBeCloseTo(withImage[11]?.time ?? 0);
    expect(ctx.stroke).toHaveBeenCalled();
  });
});

describe('useTokens', () => {
  it('re-reads the colours when the system theme changes', () => {
    let changed: () => void = () => undefined;
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addEventListener: (_: string, listener: () => void) => {
        changed = listener;
      },
      removeEventListener: vi.fn(),
    }));
    function Probe() {
      return <span>{useTokens().pitch}</span>;
    }
    render(<Probe />);
    expect(screen.getByText('#0f6b46')).toBeInTheDocument();
    document.documentElement.style.setProperty('--color-pitch', '#3dba83');
    act(() => {
      changed();
    });
    expect(screen.getByText('#3dba83')).toBeInTheDocument();
    document.documentElement.style.removeProperty('--color-pitch');
  });
});
