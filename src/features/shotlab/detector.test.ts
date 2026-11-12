import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { USAGE_REPORT_HOST } from '../../lib/usageReports';
import { createDetector, MODEL_BYTES, MODEL_URL, WASM_BASE } from './detector';

const vision = vi.hoisted(() => ({
  forVisionTasks: vi.fn(),
  createFromOptions: vi.fn(),
}));

vi.mock('@mediapipe/tasks-vision', () => ({
  FilesetResolver: { forVisionTasks: vision.forVisionTasks },
  PoseLandmarker: { createFromOptions: vision.createFromOptions },
}));

function body(bytes: number, withLength = true): Response {
  const chunk = new Uint8Array(bytes);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(chunk.subarray(0, bytes / 2));
      controller.enqueue(chunk.subarray(bytes / 2));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: withLength ? { 'content-length': String(bytes) } : {},
  });
}

const point = (x: number, y: number) => ({ x, y, z: 0, visibility: 0.9 });
const pose = (size: number) =>
  Array.from({ length: 33 }, (_, i) => point((i % 2) * size, (i % 3) * size));

const landmarker = { detectForVideo: vi.fn(), close: vi.fn() };
/** The network under the page: what really gets asked for. */
const network = vi.fn<typeof fetch>();
const video = document.createElement('video');

beforeEach(() => {
  vi.resetAllMocks();
  vision.forVisionTasks.mockResolvedValue({ wasmLoaderPath: 'x', wasmBinaryPath: 'y' });
  vision.createFromOptions.mockResolvedValue(landmarker);
  network.mockImplementation(() => Promise.resolve(body(8)));
  vi.stubGlobal('fetch', network);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createDetector', () => {
  it('loads everything from our own origin and reports progress', async () => {
    const progress = vi.fn();
    const detector = await createDetector(new AbortController().signal, progress);
    expect(network).toHaveBeenCalledWith(MODEL_URL, expect.anything());
    expect(network).toHaveBeenCalledTimes(1);
    // The library's own usage reports cannot leave the page once a detector exists.
    await expect(fetch(`https://${USAGE_REPORT_HOST}/v1/log`, { method: 'POST' })).rejects.toThrow(
      'Usage reports are not sent.',
    );
    expect(network).toHaveBeenCalledTimes(1);
    expect(MODEL_URL.startsWith('/')).toBe(true);
    expect(vision.forVisionTasks).toHaveBeenCalledWith(WASM_BASE);
    expect(progress).toHaveBeenNthCalledWith(1, { loaded: 0, total: MODEL_BYTES });
    expect(progress).toHaveBeenCalledTimes(3);
    const options = vision.createFromOptions.mock.calls[0]?.[1] as {
      baseOptions: { modelAssetBuffer: Uint8Array; delegate: string };
      runningMode: string;
      numPoses: number;
    };
    expect(options.baseOptions.delegate).toBe('GPU');
    expect(options.baseOptions.modelAssetBuffer).toHaveLength(8);
    expect(options.runningMode).toBe('VIDEO');
    expect(options.numPoses).toBe(2);
    expect(detector.delegate).toBe('GPU');
  });

  it('copes with a server that sends no length', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(body(8, false))),
    );
    await createDetector(new AbortController().signal, vi.fn());
    const options = vision.createFromOptions.mock.calls[0]?.[1] as {
      baseOptions: { modelAssetBuffer: Uint8Array };
    };
    expect(options.baseOptions.modelAssetBuffer).toHaveLength(8);
  });

  it('falls back to the CPU when the GPU delegate fails', async () => {
    vision.createFromOptions
      .mockRejectedValueOnce(new Error('no gpu'))
      .mockResolvedValueOnce(landmarker);
    const detector = await createDetector(new AbortController().signal, vi.fn());
    expect(detector.delegate).toBe('CPU');
    expect(vision.createFromOptions).toHaveBeenCalledTimes(2);
  });

  it('fails clearly when a file cannot be fetched', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(null, { status: 404 }))),
    );
    await expect(createDetector(new AbortController().signal, vi.fn())).rejects.toThrow(
      /Could not load/,
    );
  });

  it('follows the larger of two bodies and counts both', async () => {
    const detector = await createDetector(new AbortController().signal, vi.fn());
    landmarker.detectForVideo.mockReturnValue({
      landmarks: [pose(0.1), pose(0.4)],
      worldLandmarks: [pose(1), pose(2)],
    });
    const frame = detector.detect(video, 40);
    expect(landmarker.detectForVideo).toHaveBeenCalledWith(video, 40);
    expect(frame.people).toBe(2);
    expect(frame.world?.[1]?.x).toBe(2);
    expect(frame.image?.[1]).toEqual({ x: 0.4, y: 0.4, visibility: 0.9 });
  });

  it('keeps MediaPipe timestamps increasing across clips that each start at zero', async () => {
    const detector = await createDetector(new AbortController().signal, vi.fn());
    landmarker.detectForVideo.mockReturnValue({ landmarks: [], worldLandmarks: [] });
    detector.detect(video, 0);
    detector.detect(video, 0);
    detector.detect(video, 500);
    detector.beginClip();
    detector.detect(video, 0);
    const stamps = landmarker.detectForVideo.mock.calls.map((call) => call[1] as number);
    expect(stamps).toEqual([0, 1, 500, 1500]);
  });

  it('returns an empty frame when nobody is there, and closes the model', async () => {
    const detector = await createDetector(new AbortController().signal, vi.fn());
    landmarker.detectForVideo.mockReturnValue({ landmarks: [], worldLandmarks: [] });
    expect(detector.detect(video, 0)).toEqual({ image: null, world: null, people: 0 });
    detector.close();
    expect(landmarker.close).toHaveBeenCalled();
  });
});
