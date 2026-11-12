import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  decodeTracking,
  parseTrackingMeta,
  type Tracking,
  type TrackingMeta,
} from '../../engine/tracking';

/** Test-only helpers: the shipped match read from disk, and tiny synthetic matches. */
export const S = -32768;

const DIRECTORY = join(process.cwd(), 'public', 'data', 'tracking');

/** A shipped JSON file of `public/data/tracking/`, as text. */
export function shippedText(name: string): string {
  return readFileSync(join(DIRECTORY, name), 'utf-8');
}

export function shippedFiles(id = 'J03WN1'): { meta: unknown; bin: ArrayBuffer } {
  const meta: unknown = JSON.parse(shippedText(`${id}.json`));
  const raw = readFileSync(join(DIRECTORY, `${id}.bin`));
  const bin = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
  return { meta, bin };
}

let shipped: Tracking | null = null;

export function shippedTracking(): Tracking {
  if (shipped === null) {
    const { meta, bin } = shippedFiles();
    shipped = decodeTracking(bin, parseTrackingMeta(meta));
  }
  return shipped;
}

function encode(values: readonly number[]): ArrayBuffer {
  const buffer = new ArrayBuffer(values.length * 2);
  const view = new DataView(buffer);
  for (const [index, value] of values.entries()) view.setInt16(index * 2, value, true);
  return buffer;
}

/**
 * One period of `frames`, four players (slots 0-1 home, 2-3 away; shirts 1 and 9) and a ball.
 * `at(frame, column)` gives [x, y] in centimetres, or null for "not on the pitch".
 */
export function syntheticTracking(
  frames: number,
  at: (frame: number, column: number) => readonly [number, number] | null,
): Tracking {
  const meta: TrackingMeta = {
    formatVersion: 1,
    pitch: { lengthMetres: 105, widthMetres: 68 },
    sampleRateHz: 4,
    sentinel: S,
    columns: 5,
    ballColumn: 4,
    roster: (['home', 'home', 'away', 'away'] as const).map((side, slot) => ({
      slot,
      side,
      shirt: 1 + 8 * (slot % 2),
    })),
    periods: [{ period: 1, startFrame: 0, frameCount: frames, durationSeconds: (frames - 1) / 4 }],
    bytes: frames * 5 * 4,
  };
  const values: number[] = [];
  for (let f = 0; f < frames; f += 1) {
    for (let c = 0; c < 5; c += 1) values.push(...(at(f, c) ?? [S, S]));
  }
  return decodeTracking(encode(values), meta);
}

/** Keepers deep at each end; home 9 runs along x at `speed` m/s, everyone else stands still. */
export function runningTracking(frames: number, speed: number): Tracking {
  return syntheticTracking(frames, (f, c) => {
    const step = (speed * 100 * f) / 4;
    if (c === 0) return [-5000, 0];
    if (c === 1) return [-1000 + step, 500];
    if (c === 2) return [5000, 0];
    if (c === 3) return [1000, -500];
    return [0, 0];
  });
}
