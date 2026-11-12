import { describe, expect, it } from 'vitest';
import { fitOrbit, PITCH_BOX, project, stageView } from './cameraFit';
import { CAMERA_PRESETS, presetOrbit } from './pitch';
import { markerScaleFor } from './Stage';

const GRASS = PITCH_BOX.filter((p) => p[1] === 0);

describe('stageView', () => {
  for (const width of [342, 1000]) {
    // The follow camera shows a part of the pitch on purpose; it has its own check below.
    for (const preset of CAMERA_PRESETS.filter((p) => p !== 'follow')) {
      it(`fills a ${String(width)} px stage with the ${preset} view`, () => {
        const { orbit, aspect } = stageView(preset, width, -1);
        const b = project(orbit, aspect, PITCH_BOX);
        expect(b.inFront).toBe(true);
        // Never cropped: every corner, with marker height, is on screen.
        expect(Math.min(b.minX, b.minY)).toBeGreaterThanOrEqual(-1);
        expect(Math.max(b.maxX, b.maxY)).toBeLessThanOrEqual(1);
        // And it fills the frame: the wider of the two directions reaches its edges.
        expect(b.maxX - b.minX).toBeGreaterThan(1.8);
        expect(b.maxY - b.minY).toBeGreaterThan(1.2);
        expect(aspect).toBeGreaterThanOrEqual(1.1);
        expect(aspect).toBeLessThanOrEqual(2);
      });
    }
  }

  it('gives the follow camera a part of the pitch: closer than side-on, steeper on a phone', () => {
    const wide = stageView('follow', 1000, -1);
    const phone = stageView('follow', 342, -1);
    expect(wide.aspect).toBe(1.9);
    expect(phone.aspect).toBe(1.5);
    expect(wide.orbit.distance).toBeLessThan(stageView('broadcast', 1000, -1).orbit.distance);
    expect(phone.orbit.elevation).toBeGreaterThan(wide.orbit.elevation);
    const b = project(wide.orbit, wide.aspect, PITCH_BOX);
    // The whole pitch does not fit: that is what following the ball is for.
    expect(b.maxX - b.minX).toBeGreaterThan(2);
  });

  it('looks down more steeply side-on on a narrow screen', () => {
    expect(stageView('broadcast', 342, -1).orbit.elevation).toBeGreaterThan(
      stageView('broadcast', 1000, -1).orbit.elevation,
    );
  });

  it('keeps the behind-the-goal camera behind the chosen goal', () => {
    expect(stageView('goal', 342, 1).orbit.targetX).toBeGreaterThan(0);
    expect(stageView('goal', 342, -1).orbit.targetX).toBeLessThan(0);
  });
});

describe('markerScaleFor', () => {
  it('grows markers on narrow stages only, and not without limit', () => {
    expect(markerScaleFor(1000)).toBe(1);
    expect(markerScaleFor(480)).toBe(1.5);
    expect(markerScaleFor(200)).toBe(1.8);
  });
});

describe('fitOrbit', () => {
  it('backs away from a camera that starts too close to see the pitch', () => {
    const start = { ...presetOrbit('broadcast', 1.5), distance: 12 };
    const fitted = fitOrbit(start, 1.5, GRASS);
    expect(fitted.distance).toBeGreaterThan(start.distance);
    expect(project(fitted, 1.5, GRASS).inFront).toBe(true);
  });
});
