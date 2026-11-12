import type { PoseFrame, PoseLandmark } from '../../engine/pose';
import { refuseUsageReports } from '../../lib/usageReports';

/** A landmark in video pixels divided by the frame size (0..1), for the overlay. */
export interface ImagePoint {
  readonly x: number;
  readonly y: number;
  readonly visibility: number;
}

/** One analysed frame: the world skeleton for the engine, the image skeleton for drawing. */
export interface DetectedFrame extends PoseFrame {
  readonly image: readonly ImagePoint[] | null;
}

export interface PoseDetector {
  readonly delegate: 'GPU' | 'CPU';
  /** Start a new clip: its media times count from zero again. */
  beginClip(): void;
  /** Detect on the frame the video shows; `timestampMs` is the media time within the clip. */
  detect(video: HTMLVideoElement, timestampMs: number): Omit<DetectedFrame, 'time'>;
  close(): void;
}

export interface LoadProgress {
  readonly loaded: number;
  readonly total: number;
}

const BASE = import.meta.env.BASE_URL;
export const MODEL_URL = `${BASE}models/pose_landmarker_lite.task`;
export const WASM_BASE = `${BASE}vision`;
/** Sizes of the files we serve, used when a server does not send Content-Length. */
export const MODEL_BYTES = 5_777_746;

async function fetchBytes(
  url: string,
  expected: number,
  signal: AbortSignal,
  onBytes: (bytes: number) => void,
): Promise<Uint8Array> {
  const response = await fetch(url, { signal });
  if (!response.ok || response.body === null) throw new Error(`Could not load ${url}.`);
  const total = Number(response.headers.get('content-length')) || expected;
  const reader = response.body.getReader();
  const out = new Uint8Array(total);
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (received + value.length <= out.length) out.set(value, received);
    chunks.push(value);
    received += value.length;
    onBytes(value.length);
  }
  if (received === out.length) return out;
  // Compressed transfer or a wrong length header: assemble what actually arrived.
  const exact = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    exact.set(chunk, offset);
    offset += chunk.length;
  }
  return exact;
}

function toWorld(points: readonly { x: number; y: number; z: number; visibility: number }[]) {
  return points.map((p): PoseLandmark => ({ x: p.x, y: p.y, z: p.z, visibility: p.visibility }));
}

function extent(points: readonly ImagePoint[]): number {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
}

/**
 * Load MediaPipe's pose landmarker from our own origin. The library, its WebAssembly
 * runtime and the model are fetched only here, when the coach starts an analysis.
 * The model is fetched here so its download shows real progress; the library fetches
 * its WebAssembly runtime itself. (Prefetching the runtime for progress made some
 * servers send it twice, so it is not done.)
 */
export async function createDetector(
  signal: AbortSignal,
  onProgress: (progress: LoadProgress) => void,
): Promise<PoseDetector> {
  const total = MODEL_BYTES;
  let loaded = 0;
  const count = (bytes: number) => {
    loaded += bytes;
    onProgress({ loaded: Math.min(loaded, total), total });
  };
  onProgress({ loaded: 0, total });
  // The library's own usage reports are refused before it is loaded.
  refuseUsageReports();
  const [vision, model] = await Promise.all([
    import('@mediapipe/tasks-vision'),
    fetchBytes(MODEL_URL, MODEL_BYTES, signal, count),
  ]);
  const fileset = await vision.FilesetResolver.forVisionTasks(WASM_BASE);
  const create = (delegate: 'GPU' | 'CPU') =>
    vision.PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetBuffer: model, delegate },
      runningMode: 'VIDEO',
      // Two, so a second person in frame can be noticed and reported rather than mixed in.
      numPoses: 2,
    });
  let delegate: 'GPU' | 'CPU' = 'GPU';
  let landmarker;
  try {
    landmarker = await create('GPU');
  } catch {
    delegate = 'CPU';
    landmarker = await create('CPU');
  }
  const ready = landmarker;
  // MediaPipe's video mode needs strictly increasing timestamps for its whole life, but
  // each clip (and a second pass over one) starts again at zero: shift each pass past the last.
  let offset = 0;
  let last = -1;
  return {
    delegate,
    beginClip() {
      offset = last + 1000;
    },
    detect(video, timestampMs) {
      last = Math.max(last + 1, offset + timestampMs);
      const result = ready.detectForVideo(video, last);
      const people = result.landmarks.length;
      if (people === 0) return { image: null, world: null, people: 0 };
      // With two bodies in view, follow the larger one: usually the kicker nearest the camera.
      const index = result.landmarks.reduce(
        (best, pose, i, all) => (extent(pose) > extent(all[best] ?? []) ? i : best),
        0,
      );
      const image = result.landmarks[index] ?? null;
      const world = result.worldLandmarks[index] ?? null;
      return {
        image:
          image === null ? null : image.map((p) => ({ x: p.x, y: p.y, visibility: p.visibility })),
        world: world === null ? null : toWorld(world),
        people,
      };
    },
    close() {
      ready.close();
    },
  };
}
