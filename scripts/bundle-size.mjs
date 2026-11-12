// Measures what a first visit downloads and holds it to a budget.
//
//   npm run build && npm run size
//
// "First load" is the entry script, the scripts the page preloads with it, and the stylesheet:
// what a phone fetches before the front page can run. Everything else is fetched on demand
// (the 3D replay, the vision model, the professional-match screens) and is listed, not
// budgeted. Sizes are gzip, which is close to what the host sends.
import { appendFileSync, readFileSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

/**
 * Kilobytes of gzip the first load may weigh. Measured at 382.5 kB on 12 November 2026 (React,
 * the data client, the animation library, both languages and the front page); the budget is
 * a ceiling against growth, not a claim that this is small. Raise it on purpose, in a commit
 * that says why.
 */
const FIRST_LOAD_BUDGET_KB = 400;
/** No single on-demand chunk may pass this without someone deciding it should. */
const CHUNK_BUDGET_KB = 320;

const DIST = 'dist';
const kb = (bytes) => bytes / 1000;
const gzip = (path) => gzipSync(readFileSync(path)).length;

const html = readFileSync(`${DIST}/index.html`, 'utf8');
const firstLoad = [
  ...html.matchAll(/<script[^>]+src="\/(assets\/[^"]+\.js)"/g),
  ...html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="\/(assets\/[^"]+\.js)"/g),
  ...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="\/(assets\/[^"]+\.css)"/g),
].map((match) => match[1]);
if (firstLoad.length === 0) throw new Error('No entry script found in dist/index.html.');

const sizes = new Map(
  readdirSync(`${DIST}/assets`)
    .filter((name) => name.endsWith('.js') || name.endsWith('.css'))
    .map((name) => [`assets/${name}`, gzip(`${DIST}/assets/${name}`)]),
);

const firstBytes = firstLoad.reduce((sum, file) => sum + (sizes.get(file) ?? 0), 0);
const onDemand = [...sizes.entries()]
  .filter(([file]) => !firstLoad.includes(file))
  .sort((a, b) => b[1] - a[1]);
const largest = onDemand[0] ?? ['none', 0];
const total = [...sizes.values()].reduce((sum, bytes) => sum + bytes, 0);

const row = (file, bytes) =>
  `| \`${file.replace(/-[\w-]{8}\./, '.')}\` | ${kb(bytes).toFixed(1)} kB |`;
const report = [
  '## Bundle size (gzip)',
  '',
  `First load: **${kb(firstBytes).toFixed(1)} kB** of a ${String(FIRST_LOAD_BUDGET_KB)} kB budget, in ${String(firstLoad.length)} files.`,
  `Largest chunk fetched on demand: \`${largest[0].replace(/-[\w-]{8}\./, '.')}\`, ${kb(largest[1]).toFixed(1)} kB of a ${String(CHUNK_BUDGET_KB)} kB budget.`,
  `Everything: ${kb(total).toFixed(1)} kB in ${String(sizes.size)} files.`,
  '',
  '| First load | Size |',
  '| --- | --- |',
  ...firstLoad.map((file) => row(file, sizes.get(file) ?? 0)),
  '',
  '| Largest on demand | Size |',
  '| --- | --- |',
  ...onDemand.slice(0, 8).map(([file, bytes]) => row(file, bytes)),
  '',
].join('\n');

console.log(report);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${report}\n`);

const problems = [];
if (kb(firstBytes) > FIRST_LOAD_BUDGET_KB) {
  problems.push(
    `First load is ${kb(firstBytes).toFixed(1)} kB, over the ${String(FIRST_LOAD_BUDGET_KB)} kB budget.`,
  );
}
if (kb(largest[1]) > CHUNK_BUDGET_KB) {
  problems.push(
    `${largest[0]} is ${kb(largest[1]).toFixed(1)} kB, over the ${String(CHUNK_BUDGET_KB)} kB budget for one chunk.`,
  );
}
if (problems.length > 0) {
  console.error(problems.join('\n'));
  process.exit(1);
}
