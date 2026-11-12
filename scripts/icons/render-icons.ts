/*
 * Renders the PNG app icons from the SVG masters in public/icons with the Chromium that
 * @playwright/test already installs, so the icons need no image tool and no new dependency.
 *
 *   node scripts/icons/render-icons.ts
 *
 * The PNGs are committed; run this again only after changing an SVG.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const ICONS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public', 'icons');

interface Target {
  readonly source: string;
  readonly file: string;
  readonly size: number;
}

/*
 * The maskable art is full-bleed with the bench inside the safe circle, which is also what
 * iOS wants for the home screen (it rounds the corners itself and shows transparency as black).
 */
const TARGETS: readonly Target[] = [
  { source: 'icon.svg', file: 'icon-192.png', size: 192 },
  { source: 'icon.svg', file: 'icon-512.png', size: 512 },
  { source: 'icon-maskable.svg', file: 'icon-maskable-512.png', size: 512 },
  { source: 'icon-maskable.svg', file: 'apple-touch-icon-180.png', size: 180 },
];

async function main(): Promise<void> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    for (const target of TARGETS) {
      const svg = await readFile(join(ICONS, target.source), 'utf8');
      await page.setViewportSize({ width: target.size, height: target.size });
      const size = String(target.size);
      await page.setContent(
        `<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
      );
      const png = await page.screenshot({ omitBackground: true, type: 'png' });
      await writeFile(join(ICONS, target.file), png);
      process.stdout.write(`${target.file} ${size}x${size}\n`);
    }
  } finally {
    await browser.close();
  }
}

await main();
