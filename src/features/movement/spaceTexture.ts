import { SPACE_COLS, SPACE_ROWS } from './model';

/** Texture pixels per grid cell: enough for a visible stripe pattern, small enough to repaint often. */
export const SPACE_CELL_PX = 8;

/** How far apart the stripes of the second-named club repeat, in texture pixels. */
const STRIPE_PERIOD_PX = 8;
// Strong enough to read on floodlit grass, light enough that lines and players stay on top.
const HOME_ALPHA = 92;
const STRIPE_ALPHA = 118;
const GAP_ALPHA = 34;

/** "#1d4ed8" or "#14d" to [r, g, b]; anything else is a neutral grey rather than an error. */
export function hexToRgb(value: string): [number, number, number] {
  const hex = value.trim().replace('#', '');
  const full =
    hex.length === 3
      ? hex
          .split('')
          .map((c) => c + c)
          .join('')
      : hex;
  if (!/^[0-9a-f]{6}$/i.test(full)) return [128, 128, 128];
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
}

/**
 * Paint the nearest-player grid into RGBA pixels (row 0 at the lowest pitch y, as the
 * engine returns it and as a texture's first row is drawn). Home cells get a light solid
 * tint; away cells get diagonal stripes, so the two never differ by colour alone. The grid
 * is the readout's unless a finer one is given (the 3D pitch draws one).
 */
export function paintSpace(
  owners: Uint8Array,
  pixels: Uint8Array,
  colors: { readonly home: string; readonly away: string },
  cols = SPACE_COLS,
  rows = SPACE_ROWS,
  cellPx = SPACE_CELL_PX,
): void {
  const [hr, hg, hb] = hexToRgb(colors.home);
  const [ar, ag, ab] = hexToRgb(colors.away);
  const widthPx = cols * cellPx;
  const heightPx = rows * cellPx;
  for (let py = 0; py < heightPx; py += 1) {
    const row = Math.floor(py / cellPx);
    for (let px = 0; px < widthPx; px += 1) {
      const home = owners[row * cols + Math.floor(px / cellPx)] === 1;
      const at = (py * widthPx + px) * 4;
      pixels[at] = home ? hr : ar;
      pixels[at + 1] = home ? hg : ag;
      pixels[at + 2] = home ? hb : ab;
      pixels[at + 3] = home
        ? HOME_ALPHA
        : (px + py) % STRIPE_PERIOD_PX < 3
          ? STRIPE_ALPHA
          : GAP_ALPHA;
    }
  }
}
