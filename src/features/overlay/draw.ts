import type { OverlayFrame, TeamColours } from './model';
import type { Rgb, Team } from './teams';

export interface OverlayLayers {
  readonly rings: boolean;
  readonly numbers: boolean;
  readonly trails: boolean;
}

export const LAYER_KEYS = ['rings', 'numbers', 'trails'] as const;

/** The part of a 2D canvas context the overlay uses, so tests can stand in a recorder. */
export type OverlayContext = Pick<
  CanvasRenderingContext2D,
  | 'beginPath'
  | 'ellipse'
  | 'arc'
  | 'moveTo'
  | 'lineTo'
  | 'stroke'
  | 'fill'
  | 'fillText'
  | 'setLineDash'
  | 'strokeStyle'
  | 'fillStyle'
  | 'lineWidth'
  | 'lineCap'
  | 'globalAlpha'
  | 'font'
  | 'textAlign'
  | 'textBaseline'
>;

/** Anyone who is on neither team: drawn white, so it reads on grass by day and by night. */
const NEUTRAL: Rgb = [255, 255, 255];
const EDGE = 'rgb(0 0 0 / 0.6)';

export function css([r, g, b]: Rgb): string {
  return `rgb(${String(Math.round(r))} ${String(Math.round(g))} ${String(Math.round(b))})`;
}

/** The colour a player is marked in: their team's, or white for neither team. */
export function markColour(team: Team, colours: TeamColours): Rgb {
  return (team === 'none' ? null : colours[team]) ?? NEUTRAL;
}

/** Dark text on a light mark and light text on a dark one. */
export function textOn([r, g, b]: Rgb): string {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 150 ? '#101418' : '#ffffff';
}

/**
 * The stroke pattern of a team's ring, so the teams never differ by colour alone:
 * a solid ring, a dashed ring, and a dotted one for anyone on neither team.
 */
export function ringDash(team: Team, radius: number): number[] {
  if (team === 'a') return [];
  return team === 'b' ? [radius * 0.5, radius * 0.32] : [2, 5];
}

/**
 * Draw one frame's overlay on a canvas `width` by `height` CSS pixels that lies exactly over
 * the picture: a short trail, a ring at the feet and a number over the head for each player.
 */
export function drawOverlay(
  ctx: OverlayContext,
  frame: OverlayFrame,
  width: number,
  height: number,
  layers: OverlayLayers,
): void {
  const line = Math.max(2.5, width / 240);
  ctx.lineCap = 'round';
  for (const player of frame.players) {
    const colour = markColour(player.team, frame.colours);
    const x = player.feet.x * width;
    const y = player.feet.y * height;

    if (layers.trails && player.trail.length > 1) {
      ctx.setLineDash([]);
      ctx.strokeStyle = css(colour);
      ctx.lineWidth = line;
      player.trail.forEach((point, index) => {
        const before = player.trail[index - 1];
        if (before === undefined) return;
        // Older steps fade, so the trail reads as a direction and not as a second ring.
        ctx.globalAlpha = 0.75 * (index / (player.trail.length - 1));
        ctx.beginPath();
        ctx.moveTo(before.x * width, before.y * height);
        ctx.lineTo(point.x * width, point.y * height);
        ctx.stroke();
      });
      ctx.globalAlpha = 1;
    }

    if (layers.rings) {
      const radius = Math.max(9, player.box.w * width * 0.62);
      // A dark edge first, then the team's colour on top: visible on any grass and any kit.
      ctx.beginPath();
      ctx.setLineDash([]);
      ctx.strokeStyle = EDGE;
      ctx.lineWidth = line + 3;
      ctx.ellipse(x, y, radius, radius * 0.34, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.setLineDash(ringDash(player.team, radius));
      ctx.strokeStyle = css(colour);
      ctx.lineWidth = line;
      ctx.ellipse(x, y, radius, radius * 0.34, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (layers.numbers) {
      const size = Math.max(9, Math.min(15, width / 44));
      const top = Math.max(size + 2, player.box.y * height - size - 3);
      ctx.beginPath();
      ctx.arc(x, top, size, 0, Math.PI * 2);
      ctx.fillStyle = css(colour);
      ctx.fill();
      ctx.strokeStyle = EDGE;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = textOn(colour);
      ctx.font = `700 ${String(Math.round(size * 1.15))}px Archivo, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(player.number), x, top + 1);
    }
  }
}
