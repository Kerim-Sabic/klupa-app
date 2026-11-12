import type { Box } from './track';

/**
 * Splitting the players into two teams by the colour of their shirts. Each player's upper
 * body is averaged to one colour; the colours are split into two groups (two-means in OKLab,
 * a colour space where distance is close to what the eye sees); anyone far from both groups
 * (a referee, a goalkeeper) is left neutral. Pure functions on plain numbers.
 */

/** Red, green, blue, 0 to 255. */
export type Rgb = readonly [number, number, number];
/** OKLab: lightness 0 to 1, then green-red and blue-yellow, each roughly -0.4 to 0.4. */
export type Lab = readonly [number, number, number];

export type Team = 'a' | 'b' | 'none';

/** The middle colour of each team's shirts. */
export interface TeamModel {
  readonly a: Lab;
  readonly b: Lab;
}

export interface Pixels {
  /** RGBA bytes, row by row from the top, as `ImageData.data`. */
  readonly data: ArrayLike<number>;
  readonly width: number;
  readonly height: number;
}

/** Shirt colours closer than this are one kit: the split is not attempted. */
export const MIN_SEPARATION = 0.07;
/** A shirt further from its nearer team than this share of the gap between the teams is neutral. */
export const NEUTRAL_SHARE = 0.6;
/** How far the remembered team colours move towards a new split (the light changes slowly). */
const MODEL_DRIFT = 0.25;
/** Lightness counts for less than hue: half a team stands in shadow on a sunny afternoon. */
const LIGHTNESS_WEIGHT = 0.5;

const linear = (channel: number) => {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/** sRGB to OKLab (Björn Ottosson's matrices). */
export function toOklab([red, green, blue]: Rgb): Lab {
  const r = linear(red);
  const g = linear(green);
  const b = linear(blue);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

const encoded = (value: number) => {
  const c = Math.min(1, Math.max(0, value));
  return Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055));
};

/** OKLab back to sRGB, held inside what a screen can show. */
export function fromOklab([lightness, a, b]: Lab): Rgb {
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    encoded(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    encoded(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    encoded(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

/** How different two shirt colours look, with lightness counting for half. */
export function colourDistance(p: Lab, q: Lab): number {
  return Math.hypot((p[0] - q[0]) * LIGHTNESS_WEIGHT, p[1] - q[1], p[2] - q[2]);
}

/**
 * The colour of a player's shirt: the mean of the middle of the upper body of their box
 * (clear of the head, the arms and the grass beside them). Null when that patch lies outside
 * the picture.
 */
export function shirtColour(pixels: Pixels, box: Box): Rgb | null {
  const x0 = Math.max(0, Math.floor((box.x + box.w * 0.3) * pixels.width));
  const x1 = Math.min(pixels.width, Math.ceil((box.x + box.w * 0.7) * pixels.width));
  const y0 = Math.max(0, Math.floor((box.y + box.h * 0.2) * pixels.height));
  const y1 = Math.min(pixels.height, Math.ceil((box.y + box.h * 0.45) * pixels.height));
  let [red, green, blue, count] = [0, 0, 0, 0];
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const at = (y * pixels.width + x) * 4;
      red += pixels.data[at] ?? 0;
      green += pixels.data[at + 1] ?? 0;
      blue += pixels.data[at + 2] ?? 0;
      count += 1;
    }
  }
  return count === 0 ? null : [red / count, green / count, blue / count];
}

function mean(colours: readonly Lab[]): Lab {
  const n = Math.max(1, colours.length);
  return [0, 1, 2].map((i) => colours.reduce((sum, c) => sum + (c[i] ?? 0), 0) / n) as [
    number,
    number,
    number,
  ];
}

/** Shirts closer than this are "the same kit" when looking for where the teams are. */
const KIT_RADIUS = 0.1;

/**
 * Where the split starts when there is nothing to go on. A team is several shirts of one
 * colour and a referee is one, so the first seed is the colour with the most company, and
 * the second the colour with the most company among those that are not that kit (when every
 * shirt is much the same: simply the furthest one).
 */
function seeds(first: Lab, colours: readonly Lab[]): TeamModel {
  const company = (c: Lab) => colours.filter((o) => colourDistance(c, o) < KIT_RADIUS).length;
  let a = first;
  for (const c of colours) if (company(c) > company(a)) a = c;
  let b = a;
  let best = -1;
  for (const c of colours) {
    const gap = colourDistance(a, c);
    const score = gap >= KIT_RADIUS ? company(c) * 10 + gap : gap;
    if (score > best) {
      best = score;
      b = c;
    }
  }
  return { a, b };
}

/**
 * Two-means that leaves outliers out: each team colour becomes the mean of the shirts that
 * are nearer to it than to the other team and not too far from it, so one referee in yellow
 * cannot drag a team's colour towards yellow.
 */
function refine(colours: readonly Lab[], start: TeamModel): TeamModel {
  let model = start;
  for (let round = 0; round < 6; round += 1) {
    const from: TeamModel = model;
    const limit = colourDistance(from.a, from.b) * NEUTRAL_SHARE;
    const nearA = colours.filter((c) => {
      const d = colourDistance(c, from.a);
      return d <= limit && d <= colourDistance(c, from.b);
    });
    const nearB = colours.filter((c) => {
      const d = colourDistance(c, from.b);
      return d <= limit && d < colourDistance(c, from.a);
    });
    model = {
      a: nearA.length > 0 ? mean(nearA) : from.a,
      b: nearB.length > 0 ? mean(nearB) : from.b,
    };
  }
  return model;
}

/** True when the two team colours are far enough apart to tell the teams by them. */
export function canSplit(model: TeamModel | null): model is TeamModel {
  return model !== null && colourDistance(model.a, model.b) >= MIN_SEPARATION;
}

function drift(from: Lab, to: Lab): Lab {
  return [
    from[0] + (to[0] - from[0]) * MODEL_DRIFT,
    from[1] + (to[1] - from[1]) * MODEL_DRIFT,
    from[2] + (to[2] - from[2]) * MODEL_DRIFT,
  ];
}

/**
 * Split shirt colours into two teams. With a usable model from the frame before, the split
 * starts from it, so team "a" stays team "a", and the remembered colours drift a little
 * towards the new split. A model learnt while only one team was in the picture is given up
 * once a fresh look puts clearly more shirts in a team (the labels are kept where they can
 * be). With fewer than two colours there is nothing to learn and the model is kept.
 */
export function splitTeams(colours: readonly Lab[], previous: TeamModel | null): TeamModel | null {
  const first = colours[0];
  if (first === undefined || colours.length < 2) return previous;
  const fresh = refine(colours, seeds(first, colours));
  if (!canSplit(previous)) return fresh;
  const kept = refine(colours, previous);
  const placed = (model: TeamModel) => colours.filter((c) => teamOf(c, model) !== 'none').length;
  if (placed(fresh) > placed(kept) + 1) {
    const same = colourDistance(fresh.a, previous.a) + colourDistance(fresh.b, previous.b);
    const swapped = colourDistance(fresh.a, previous.b) + colourDistance(fresh.b, previous.a);
    return same <= swapped ? fresh : { a: fresh.b, b: fresh.a };
  }
  return { a: drift(previous.a, kept.a), b: drift(previous.b, kept.b) };
}

/** Which team a shirt belongs to: the nearer one, or neither when it is far from both. */
export function teamOf(colour: Lab, model: TeamModel | null): Team {
  if (!canSplit(model)) return 'none';
  const toA = colourDistance(colour, model.a);
  const toB = colourDistance(colour, model.b);
  const limit = colourDistance(model.a, model.b) * NEUTRAL_SHARE;
  if (Math.min(toA, toB) > limit) return 'none';
  return toA <= toB ? 'a' : 'b';
}

/**
 * The colour a team's rings are drawn in: its shirt colour, lifted to a lightness that shows
 * on grass and a little stronger, so a navy kit is a clear blue ring and not a black one.
 */
export function ringColour(shirt: Lab): Rgb {
  const lightness = Math.min(0.9, Math.max(0.62, shirt[0]));
  // The darker the kit, the more its hue is brought out: lifted alone, navy would be grey.
  const gain = 1.3 + Math.max(0, 0.62 - shirt[0]) * 2.5;
  return fromOklab([lightness, shirt[1] * gain, shirt[2] * gain]);
}
