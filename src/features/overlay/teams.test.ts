import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  canSplit,
  colourDistance,
  fromOklab,
  ringColour,
  shirtColour,
  splitTeams,
  teamOf,
  toOklab,
  type Lab,
  type Rgb,
} from './teams';

const RED: Rgb = [200, 30, 40];
const BLUE: Rgb = [30, 60, 180];
const near = ([r, g, b]: Rgb, by: number): Rgb => [r + by, g - by / 2, b + by / 3];
const lab = (rgb: Rgb) => toOklab(rgb);

/** A picture of plain grass with rectangles painted on it, as RGBA bytes. */
function picture(width: number, height: number, patches: [number, number, number, number, Rgb][]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) data.set([40, 140, 60, 255], i * 4);
  for (const [x0, y0, x1, y1, colour] of patches) {
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) data.set([...colour, 255], (y * width + x) * 4);
    }
  }
  return { data, width, height };
}

describe('OKLab', () => {
  it('puts white, black and red where the colour space says they are', () => {
    const white = toOklab([255, 255, 255]);
    expect(white[0]).toBeCloseTo(1, 3);
    expect(Math.hypot(white[1], white[2])).toBeLessThan(1e-3);
    expect(toOklab([0, 0, 0])).toEqual([0, 0, 0]);
    const red = toOklab([255, 0, 0]);
    expect(red[0]).toBeCloseTo(0.628, 2);
    expect(red[1]).toBeCloseTo(0.225, 2);
    expect(red[2]).toBeCloseTo(0.126, 2);
  });

  it('comes back to the same screen colour', () => {
    const channel = fc.integer({ min: 0, max: 255 });
    fc.assert(
      fc.property(channel, channel, channel, (r, g, b) => {
        const back = fromOklab(toOklab([r, g, b]));
        expect(Math.abs(back[0] - r)).toBeLessThanOrEqual(1);
        expect(Math.abs(back[1] - g)).toBeLessThanOrEqual(1);
        expect(Math.abs(back[2] - b)).toBeLessThanOrEqual(1);
      }),
    );
    // A colour no screen can show is held inside what it can.
    expect(fromOklab([1.4, 0.6, -0.6]).every((c) => c >= 0 && c <= 255)).toBe(true);
  });

  it('counts lightness for half: shade matters less than hue', () => {
    expect(colourDistance(toOklab([255, 255, 255]), [0, 0, 0])).toBeCloseTo(0.5, 2);
    expect(colourDistance(lab(RED), lab(RED))).toBe(0);
    expect(colourDistance(lab(RED), lab(BLUE))).toBeGreaterThan(0.3);
  });
});

describe('shirtColour', () => {
  it('reads the middle of the upper body and nothing of the grass beside it', () => {
    // A box 20 px wide and 40 tall at (10, 10); the shirt patch is columns 16-24, rows 18-28.
    const image = picture(40, 60, [[16, 18, 24, 28, RED]]);
    expect(shirtColour(image, { x: 0.25, y: 10 / 60, w: 0.5, h: 40 / 60 })).toEqual(RED);
    // The same box on bare grass reads grass.
    expect(shirtColour(picture(40, 60, []), { x: 0.25, y: 10 / 60, w: 0.5, h: 40 / 60 })).toEqual([
      40, 140, 60,
    ]);
  });

  it('reads what is inside the picture of a box that hangs over the edge, or nothing', () => {
    const image = picture(40, 60, [[0, 0, 40, 60, BLUE]]);
    expect(shirtColour(image, { x: -0.2, y: -0.1, w: 0.5, h: 0.6 })).toEqual(BLUE);
    expect(shirtColour(image, { x: 1.2, y: 0.2, w: 0.2, h: 0.4 })).toBeNull();
    expect(shirtColour(image, { x: 0.2, y: 1.5, w: 0.2, h: 0.4 })).toBeNull();
  });
});

describe('splitTeams and teamOf', () => {
  const reds = [0, 6, -5, 9].map((by) => lab(near(RED, by)));
  const blues = [0, -6, 8, 4].map((by) => lab(near(BLUE, by)));

  it('splits two kits into two teams and leaves a referee out', () => {
    const model = splitTeams([...reds, ...blues], null);
    expect(canSplit(model)).toBe(true);
    const redTeam = teamOf(reds[0] as Lab, model);
    const blueTeam = teamOf(blues[0] as Lab, model);
    expect(new Set([redTeam, blueTeam])).toEqual(new Set(['a', 'b']));
    expect(reds.every((c) => teamOf(c, model) === redTeam)).toBe(true);
    expect(blues.every((c) => teamOf(c, model) === blueTeam)).toBe(true);
    expect(teamOf(lab([240, 230, 40]), model)).toBe('none');
    expect(teamOf(lab([15, 15, 15]), model)).toBe('none');
  });

  it('does not depend on the order players are listed in', () => {
    const mixed = [reds[0], blues[0], reds[1], blues[1], blues[2], reds[2]] as Lab[];
    const model = splitTeams(mixed, null);
    expect(teamOf(reds[3] as Lab, model)).toBe(teamOf(reds[0] as Lab, model));
    expect(teamOf(blues[3] as Lab, model)).not.toBe(teamOf(reds[0] as Lab, model));
  });

  it('keeps team a as team a from one frame to the next, drifting with the light', () => {
    const first = splitTeams([...blues, ...reds], null);
    expect(first).not.toBeNull();
    const blueTeam = teamOf(blues[0] as Lab, first);
    // The next frame lists the reds first, and the afternoon has got a little darker.
    const darker = (c: Lab): Lab => [c[0] - 0.05, c[1], c[2]];
    const second = splitTeams([...reds.map(darker), ...blues.map(darker)], first);
    expect(teamOf(darker(blues[1] as Lab), second)).toBe(blueTeam);
    expect(teamOf(darker(reds[1] as Lab), second)).not.toBe(blueTeam);
    const moved = (second?.a[0] ?? 0) - (first?.a[0] ?? 0);
    expect(moved).toBeLessThan(0);
    expect(moved).toBeGreaterThan(-0.05);
  });

  it('does not let one referee drag a team colour towards their own', () => {
    const yellow = lab([240, 230, 40]);
    const withReferee = splitTeams([yellow, ...reds, ...blues], null);
    const without = splitTeams([...reds, ...blues], null);
    expect(teamOf(yellow, withReferee)).toBe('none');
    const redWith = teamOf(reds[0] as Lab, withReferee) === 'a' ? withReferee?.a : withReferee?.b;
    const redWithout = teamOf(reds[0] as Lab, without) === 'a' ? without?.a : without?.b;
    expect(colourDistance(redWith as Lab, redWithout as Lab)).toBeLessThan(1e-9);
  });

  it('gives up a split learnt from one team once the other team comes into the picture', () => {
    const yellow = lab([240, 230, 40]);
    // Only the reds and the referee are in view: the referee is the only "other" there is.
    let model = splitTeams([...reds, yellow], null);
    const redTeam = teamOf(reds[0] as Lab, model);
    expect(redTeam).not.toBe('none');
    expect(teamOf(yellow, model)).not.toBe(redTeam);
    // The camera pans and the blues arrive.
    for (let frame = 0; frame < 3; frame += 1)
      model = splitTeams([...reds, yellow, ...blues], model);
    expect(reds.every((c) => teamOf(c, model) === redTeam)).toBe(true);
    const blueTeam = teamOf(blues[0] as Lab, model);
    expect(blueTeam).not.toBe('none');
    expect(blueTeam).not.toBe(redTeam);
    expect(teamOf(yellow, model)).toBe('none');
  });

  it('learns nothing from fewer than two shirts', () => {
    expect(splitTeams([], null)).toBeNull();
    expect(splitTeams([reds[0] as Lab], null)).toBeNull();
    const model = splitTeams([...reds, ...blues], null);
    expect(splitTeams([reds[0] as Lab], model)).toBe(model);
  });

  it('does not guess when both sides wear nearly the same', () => {
    const model = splitTeams(reds, null);
    expect(model).not.toBeNull();
    expect(canSplit(model)).toBe(false);
    expect(reds.map((c) => teamOf(c, model))).toEqual(['none', 'none', 'none', 'none']);
    expect(teamOf(reds[0] as Lab, null)).toBe('none');
    expect(canSplit(null)).toBe(false);
  });
});

describe('ringColour', () => {
  it('lifts a dark kit to a ring that shows on grass and keeps its hue', () => {
    const navy = ringColour(lab([18, 28, 74]));
    expect(navy[2]).toBeGreaterThan(navy[0] + 40);
    expect(0.2126 * navy[0] + 0.7152 * navy[1] + 0.0722 * navy[2]).toBeGreaterThan(110);
  });

  it('keeps a white kit just short of pure white, and a red kit red', () => {
    const white = ringColour(lab([250, 250, 250]));
    expect(Math.min(...white)).toBeGreaterThan(200);
    expect(Math.max(...white)).toBeLessThan(245);
    const red = ringColour(lab(RED));
    expect(red[0]).toBeGreaterThan(200);
    expect(red[0]).toBeGreaterThan(red[2] + 80);
  });
});
