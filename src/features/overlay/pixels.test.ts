import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPixelReader, SAMPLE_WIDTH } from './pixels';

function videoOf(width: number, height: number): HTMLVideoElement {
  const video = document.createElement('video');
  Object.defineProperty(video, 'videoWidth', { value: width });
  Object.defineProperty(video, 'videoHeight', { value: height });
  return video;
}

function fakeContext() {
  const context = {
    drawImage: vi.fn(),
    getImageData: vi.fn((_x: number, _y: number, width: number, height: number) => ({
      data: new Uint8ClampedArray(width * height * 4),
    })),
  };
  const getContext = vi
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockReturnValue(context as unknown as CanvasRenderingContext2D);
  return { context, getContext };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createPixelReader', () => {
  it('reads the frame small, in the shape of the video, from one canvas it keeps', () => {
    const { context, getContext } = fakeContext();
    const create = vi.spyOn(document, 'createElement');
    const read = createPixelReader();
    const video = videoOf(1280, 720);
    const pixels = read(video);
    expect(pixels?.width).toBe(SAMPLE_WIDTH);
    expect(pixels?.height).toBe(108);
    expect(pixels?.data).toHaveLength(SAMPLE_WIDTH * 108 * 4);
    expect(context.drawImage).toHaveBeenCalledWith(video, 0, 0, SAMPLE_WIDTH, 108);
    expect(getContext).toHaveBeenCalledWith('2d', { willReadFrequently: true });
    read(video);
    read(videoOf(720, 1280));
    // One canvas and one context for the whole visit, resized when the video's shape changes.
    expect(create.mock.calls.filter(([tag]) => tag === 'canvas')).toHaveLength(1);
    expect(getContext).toHaveBeenCalledTimes(1);
    expect(context.getImageData).toHaveBeenLastCalledWith(0, 0, SAMPLE_WIDTH, 341);
  });

  it('never enlarges a video that is already smaller', () => {
    fakeContext();
    const pixels = createPixelReader()(videoOf(96, 54));
    expect([pixels?.width, pixels?.height]).toEqual([96, 54]);
  });

  it('reads nothing before the video has a size, or where there is no 2D canvas', () => {
    const { context } = fakeContext();
    expect(createPixelReader()(videoOf(0, 0))).toBeNull();
    expect(context.drawImage).not.toHaveBeenCalled();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    expect(createPixelReader()(videoOf(640, 360))).toBeNull();
  });
});
