import { refuseUsageReports } from '../../lib/usageReports';
import { WASM_BASE } from '../shotlab/detector';
import type { Detection } from './track';

export interface PlayerDetector {
  readonly delegate: 'GPU' | 'CPU';
  /** The people in the frame the video shows now. `nowMs` only has to keep increasing. */
  detect(video: HTMLVideoElement, nowMs: number): Detection[];
  close(): void;
}

export interface LoadProgress {
  readonly loaded: number;
  readonly total: number;
}

export type GetDetector = (
  signal: AbortSignal,
  onProgress: (progress: LoadProgress) => void,
) => Promise<PlayerDetector>;

export const MODEL_URL = `${import.meta.env.BASE_URL}models/efficientdet_lite0.tflite`;
/** Size of the file we serve (public/models/README.md), for progress before it has arrived. */
export const MODEL_BYTES = 7_254_339;
/** Below this the model is guessing: a corner flag is not a player. */
export const MIN_SCORE = 0.3;
const MAX_PEOPLE = 40;

async function fetchModel(
  signal: AbortSignal,
  onBytes: (received: number) => void,
): Promise<Uint8Array> {
  const response = await fetch(MODEL_URL, { signal });
  if (!response.ok || response.body === null) throw new Error('Could not load the model.');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onBytes(received);
  }
  const model = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    model.set(chunk, offset);
    offset += chunk.length;
  }
  return model;
}

export interface RawDetection {
  readonly boundingBox?: {
    readonly originX: number;
    readonly originY: number;
    readonly width: number;
    readonly height: number;
  };
  readonly categories: readonly { readonly categoryName: string; readonly score: number }[];
}

/**
 * The model's boxes (video pixels) as shares of the picture, people only. The model is asked
 * for people alone, and the category is checked again here, so a ball or a bench never gets
 * a number even if a runtime ignores the allow-list.
 */
export function toDetections(
  raw: readonly RawDetection[],
  videoWidth: number,
  videoHeight: number,
): Detection[] {
  if (!(videoWidth > 0 && videoHeight > 0)) return [];
  const people: Detection[] = [];
  for (const { boundingBox: box, categories } of raw) {
    const best = categories[0];
    if (box === undefined || best?.categoryName !== 'person' || best.score < MIN_SCORE) continue;
    const x = Math.max(0, box.originX / videoWidth);
    const y = Math.max(0, box.originY / videoHeight);
    const w = Math.min(1, (box.originX + box.width) / videoWidth) - x;
    const h = Math.min(1, (box.originY + box.height) / videoHeight) - y;
    if (w > 0 && h > 0) people.push({ x, y, w, h, score: best.score });
  }
  return people;
}

/**
 * Load MediaPipe's object detector with EfficientDet-Lite0 from our own origin. The library,
 * its WebAssembly runtime and the model are fetched only here, when the coach picks a video
 * or opens the camera, and nothing else is fetched while it runs. The library's own usage
 * reports are refused before it is loaded.
 */
export const createDetector: GetDetector = async (signal, onProgress) => {
  onProgress({ loaded: 0, total: MODEL_BYTES });
  refuseUsageReports();
  const [vision, model] = await Promise.all([
    import('@mediapipe/tasks-vision'),
    fetchModel(signal, (received) => {
      onProgress({ loaded: Math.min(received, MODEL_BYTES), total: MODEL_BYTES });
    }),
  ]);
  const fileset = await vision.FilesetResolver.forVisionTasks(WASM_BASE);
  const create = (delegate: 'GPU' | 'CPU') =>
    vision.ObjectDetector.createFromOptions(fileset, {
      baseOptions: { modelAssetBuffer: model, delegate },
      runningMode: 'VIDEO',
      categoryAllowlist: ['person'],
      scoreThreshold: MIN_SCORE,
      maxResults: MAX_PEOPLE,
    });
  let delegate: 'GPU' | 'CPU' = 'GPU';
  let detector;
  try {
    detector = await create('GPU');
  } catch {
    delegate = 'CPU';
    detector = await create('CPU');
  }
  const ready = detector;
  // Video mode wants strictly increasing whole milliseconds for its whole life.
  let last = 0;
  return {
    delegate,
    detect(video, nowMs) {
      last = Math.max(last + 1, Math.round(nowMs));
      const result = ready.detectForVideo(video, last);
      return toDetections(result.detections, video.videoWidth, video.videoHeight);
    },
    close() {
      ready.close();
    },
  };
};
