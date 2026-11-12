// Copies the MediaPipe Tasks Vision WebAssembly runtime into public/vision/ so the
// pose detector is served from our own origin (the content security policy allows
// nothing else). The copies are build output, not source: `npm install` runs this script
// (postinstall), so they always match the version the lockfile pins, and git ignores them.
//
//   node scripts/vision/copy-assets.mjs
//
// Only the classic-script pair is copied. FilesetResolver.forVisionTasks(base) with
// useModule=false (the default) loads exactly `vision_wasm_internal.js` and
// `vision_wasm_internal.wasm`; the ES-module pair would add 14 MB nobody loads.
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { stdout } from 'node:process';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const packageDir = join(root, 'node_modules', '@mediapipe', 'tasks-vision');
const source = join(packageDir, 'wasm');
const target = join(root, 'public', 'vision');
const files = ['vision_wasm_internal.js', 'vision_wasm_internal.wasm'];

/** @param {string} path */
async function sha256(path) {
  return createHash('sha256')
    .update(await readFile(path))
    .digest('hex');
}

async function main() {
  /** @type {unknown} */
  const pkg = JSON.parse(await readFile(join(packageDir, 'package.json'), 'utf8'));
  const version =
    typeof pkg === 'object' && pkg !== null && 'version' in pkg ? String(pkg.version) : '?';
  await mkdir(target, { recursive: true });
  const lines = [
    '# MediaPipe Tasks Vision runtime',
    '',
    `Copied from \`@mediapipe/tasks-vision@${version}\` (\`node_modules/@mediapipe/tasks-vision/wasm/\`) by \`scripts/vision/copy-assets.mjs\`. Apache-2.0.`,
    '',
    '| File | Bytes | SHA-256 |',
    '| ---- | ----- | ------- |',
  ];
  for (const file of files) {
    const to = join(target, file);
    await copyFile(join(source, file), to);
    const { size } = await stat(to);
    lines.push(`| \`${file}\` | ${String(size)} | \`${await sha256(to)}\` |`);
    stdout.write(`copied ${file} (${String(size)} bytes)\n`);
  }
  lines.push('');
  await writeFile(join(target, 'README.md'), lines.join('\n'));
}

await main();
