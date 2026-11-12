import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MODEL_BYTES } from './detector';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path));
const sha256 = (path: string) => createHash('sha256').update(read(path)).digest('hex');

const MODEL = 'public/models/efficientdet_lite0.tflite';
const MODEL_SHA = '4b59100025bea1235a84c1038879a6cccc9f6c49f5e41144e91e74d99e780993';
const SAMPLE = 'public/data/overlay/sample.mp4';
const SAMPLE_SHA = 'cfcb31e994cbdf002d06682784f52fa578b53a2e72f65f034ab5777af8aeb37e';

/**
 * The model and the sample clip are served from our own origin and committed as files. A
 * formatter or a bad copy must not change a byte of them, and each must stay the file whose
 * source and licence are written down: this pins them to those records.
 */
describe('player overlay assets', () => {
  it('serves the detector model recorded in public/models/README.md', () => {
    expect(read(MODEL)).toHaveLength(MODEL_BYTES);
    expect(sha256(MODEL)).toBe(MODEL_SHA);
    const readme = read('public/models/README.md').toString('utf8');
    expect(readme).toContain(MODEL_SHA);
    expect(readme).toContain('Apache-2.0');
  });

  it('serves the sample clip whose source and licence are in the data manifest', () => {
    const clip = read(SAMPLE);
    expect(sha256(SAMPLE)).toBe(SAMPLE_SHA);
    // Small enough for a phone on mobile data.
    expect(clip.length).toBeLessThan(3_000_000);
    const manifest = JSON.parse(read('research/data/MANIFEST.json').toString('utf8')) as Record<
      string,
      { licence?: string; servedAs?: { path: string; sha256: string; bytes: number } }
    >;
    const entry = Object.values(manifest).find((value) => value.servedAs?.path === SAMPLE);
    expect(entry?.servedAs?.sha256).toBe(SAMPLE_SHA);
    expect(entry?.servedAs?.bytes).toBe(clip.length);
    expect(entry?.licence).toBe('Pexels License');
    const model = Object.values(manifest).find((value) => value.servedAs?.path === MODEL);
    expect(model?.servedAs?.sha256).toBe(MODEL_SHA);
    expect(model?.licence).toBe('Apache-2.0');
  });
});
