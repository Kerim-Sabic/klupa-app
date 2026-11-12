import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MODEL_BYTES } from './detector';

/** Size of the runtime the locked package version ships; a different size means a different build. */
const WASM_BYTES = 14_603_354;

const root = process.cwd();
const sha256 = (path: string) =>
  createHash('sha256')
    .update(readFileSync(join(root, path)))
    .digest('hex');

/**
 * The runtime and model are served from our own origin and committed as files. A
 * formatter or a bad copy must not change a byte of them: this pins them.
 */
describe('on-device vision assets', () => {
  it('serves the MediaPipe runtime exactly as the installed package ships it', () => {
    for (const file of ['vision_wasm_internal.js', 'vision_wasm_internal.wasm']) {
      expect(sha256(`public/vision/${file}`), file).toBe(
        sha256(`node_modules/@mediapipe/tasks-vision/wasm/${file}`),
      );
    }
    expect(readFileSync(join(root, 'public/vision/vision_wasm_internal.wasm'))).toHaveLength(
      WASM_BYTES,
    );
  });

  it('serves the pose model recorded in public/models/README.md', () => {
    const model = readFileSync(join(root, 'public/models/pose_landmarker_lite.task'));
    expect(model).toHaveLength(MODEL_BYTES);
    expect(sha256('public/models/pose_landmarker_lite.task')).toBe(
      '59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a',
    );
    expect(readFileSync(join(root, 'public/models/README.md'), 'utf8')).toContain(
      '59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a',
    );
  });
});
