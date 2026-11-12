import type { Positions } from './motion';

/**
 * Space control for the 3D frame loop: which team reaches each patch of the pitch first, read
 * as "whose player is nearest" on a coarse grid. The same rule as `spaceControl` in the engine
 * (goalkeepers included, a tie goes to the lower roster slot, 1 = the first-named club), but
 * computed from the positions already sampled for this frame and written into a buffer that
 * is allocated once. Nearest player only: not a model of speed, direction or reach.
 *
 * Returns the first-named club's share of the cells, or null when nobody is on the pitch
 * (the buffer is then left as it was).
 */
export function spaceInto(
  positions: Positions,
  /** 1 where the roster slot belongs to the first-named club, one entry per slot. */
  home: Uint8Array,
  cols: number,
  rows: number,
  lengthMetres: number,
  widthMetres: number,
  owners: Uint8Array,
): number | null {
  const players = home.length;
  let anyone = false;
  for (let slot = 0; slot < players; slot += 1) {
    if (positions.present[slot] === 1) {
      anyone = true;
      break;
    }
  }
  if (!anyone || cols < 1 || rows < 1) return null;
  let homeCells = 0;
  for (let row = 0; row < rows; row += 1) {
    const cy = -widthMetres / 2 + (row + 0.5) * (widthMetres / rows);
    for (let col = 0; col < cols; col += 1) {
      const cx = -lengthMetres / 2 + (col + 0.5) * (lengthMetres / cols);
      let best = Infinity;
      let owner = 0;
      for (let slot = 0; slot < players; slot += 1) {
        if (positions.present[slot] !== 1) continue;
        const dx = cx - (positions.xy[slot * 2] ?? 0);
        const dy = cy - (positions.xy[slot * 2 + 1] ?? 0);
        const d = dx * dx + dy * dy;
        if (d < best) {
          best = d;
          owner = home[slot] ?? 0;
        }
      }
      owners[row * cols + col] = owner;
      homeCells += owner;
    }
  }
  return homeCells / (cols * rows);
}
