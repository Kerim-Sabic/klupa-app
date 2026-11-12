import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { USAGE_REPORT_HOST } from '../../lib/usageReports';
import { WASM_BASE } from '../shotlab/detector';
import { createDetector, MIN_SCORE, MODEL_BYTES, MODEL_URL, toDetections } from './detector';

const vision = vi.hoisted(() => ({
  forVisionTasks: vi.fn(),
  createFromOptions: vi.fn(),
}));

vi.mock('@mediapipe/tasks-vision', () => ({
  FilesetResolver: { forVisionTasks: vision.forVisionTasks },
  ObjectDetector: { createFromOptions: vision.createFromOptions },
}));

function body(bytes: number): Response {
  const chunk = new Uint8Array(bytes).fill(7);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(chunk.subarray(0, bytes / 2));
      controller.enqueue(chunk.subarray(bytes / 2));
      controller.close();
    },
  });
  return new Response(stream, { status: 200 });
}

const found = (
  name: string,
  score: number,
  box = { originX: 64, originY: 36, width: 32, height: 90 },
) => ({
  boundingBox: box,
  categories: [{ categoryName: name, score }],
});

/** The box of `found` in a 640 x 360 picture, as shares of it. */
const SHARE = {
  x: expect.closeTo(0.1) as number,
  y: expect.closeTo(0.1) as number,
  w: expect.closeTo(0.05) as number,
  h: expect.closeTo(0.25) as number,
  score: 0.8,
};

const runtime = { detectForVideo: vi.fn(), close: vi.fn() };
/** The network under the page: what really gets asked for. */
const network = vi.fn<typeof fetch>();
const video = document.createElement('video');
Object.defineProperty(video, 'videoWidth', { value: 640 });
Object.defineProperty(video, 'videoHeight', { value: 360 });

beforeEach(() => {
  vi.resetAllMocks();
  vision.forVisionTasks.mockResolvedValue({ wasmLoaderPath: 'x', wasmBinaryPath: 'y' });
  vision.createFromOptions.mockResolvedValue(runtime);
  runtime.detectForVideo.mockReturnValue({ detections: [] });
  network.mockImplementation(() => Promise.resolve(body(8)));
  vi.stubGlobal('fetch', network);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('toDetections', () => {
  it('turns pixel boxes into shares of the picture', () => {
    expect(toDetections([found('person', 0.8)], 640, 360)).toEqual([SHARE]);
  });

  it('keeps only people the model is reasonably sure of', () => {
    const raw = [
      found('person', 0.9),
      found('sports ball', 0.95),
      found('person', MIN_SCORE - 0.01),
      found('bench', 0.7),
      { categories: [{ categoryName: 'person', score: 0.9 }] },
      { boundingBox: { originX: 0, originY: 0, width: 5, height: 5 }, categories: [] },
    ];
    expect(toDetections(raw, 640, 360)).toHaveLength(1);
  });

  it('cuts a box at the edge of the picture and drops one outside it', () => {
    const [cut] = toDetections(
      [found('person', 0.8, { originX: -20, originY: 300, width: 60, height: 120 })],
      640,
      360,
    );
    expect(cut?.x).toBe(0);
    expect(cut?.w).toBeCloseTo(40 / 640);
    expect((cut?.y ?? 0) + (cut?.h ?? 0)).toBe(1);
    expect(
      toDetections(
        [found('person', 0.8, { originX: 700, originY: 10, width: 30, height: 60 })],
        640,
        360,
      ),
    ).toEqual([]);
  });

  it('finds nobody in a video that has no size yet', () => {
    expect(toDetections([found('person', 0.9)], 0, 360)).toEqual([]);
    expect(toDetections([found('person', 0.9)], 640, 0)).toEqual([]);
  });
});

describe('createDetector', () => {
  it('loads the model from our own origin, asks for people only, and reports progress', async () => {
    const progress = vi.fn();
    const detector = await createDetector(new AbortController().signal, progress);
    expect(network).toHaveBeenCalledTimes(1);
    expect(network).toHaveBeenCalledWith(MODEL_URL, expect.anything());
    // The library's own usage reports cannot leave the page once a detector exists.
    await expect(fetch(`https://${USAGE_REPORT_HOST}/v1/log`, { method: 'POST' })).rejects.toThrow(
      'Usage reports are not sent.',
    );
    expect(network).toHaveBeenCalledTimes(1);
    expect(MODEL_URL).toBe('/models/efficientdet_lite0.tflite');
    expect(vision.forVisionTasks).toHaveBeenCalledWith(WASM_BASE);
    expect(progress).toHaveBeenNthCalledWith(1, { loaded: 0, total: MODEL_BYTES });
    expect(progress).toHaveBeenLastCalledWith({ loaded: 8, total: MODEL_BYTES });
    const options = vision.createFromOptions.mock.calls[0]?.[1] as {
      baseOptions: { modelAssetBuffer: Uint8Array; delegate: string };
      runningMode: string;
      categoryAllowlist: string[];
      scoreThreshold: number;
    };
    expect(options.baseOptions.delegate).toBe('GPU');
    expect(Array.from(options.baseOptions.modelAssetBuffer)).toEqual(Array(8).fill(7));
    expect(options.runningMode).toBe('VIDEO');
    expect(options.categoryAllowlist).toEqual(['person']);
    expect(options.scoreThreshold).toBe(MIN_SCORE);
    expect(detector.delegate).toBe('GPU');
  });

  it('falls back to the processor when the graphics path cannot start', async () => {
    vision.createFromOptions.mockRejectedValueOnce(new Error('no WebGL'));
    const detector = await createDetector(new AbortController().signal, vi.fn());
    expect(detector.delegate).toBe('CPU');
    expect(vision.createFromOptions).toHaveBeenCalledTimes(2);
  });

  it('hands the model strictly increasing whole milliseconds, whatever the clock does', async () => {
    const detector = await createDetector(new AbortController().signal, vi.fn());
    runtime.detectForVideo.mockReturnValue({ detections: [found('person', 0.8)] });
    expect(detector.detect(video, 1000.4)).toEqual([SHARE]);
    detector.detect(video, 1000.4);
    detector.detect(video, 20);
    detector.detect(video, 5000);
    expect(runtime.detectForVideo.mock.calls.map((call: unknown[]) => call[1])).toEqual([
      1000, 1001, 1002, 5000,
    ]);
    detector.close();
    expect(runtime.close).toHaveBeenCalledTimes(1);
  });

  it('fails when the model cannot be fetched', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(null, { status: 404 }))),
    );
    await expect(createDetector(new AbortController().signal, vi.fn())).rejects.toThrow(
      'Could not load the model.',
    );
    expect(vision.createFromOptions).not.toHaveBeenCalled();
  });
});
