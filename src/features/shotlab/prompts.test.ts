import { describe, expect, it } from 'vitest';
import { analyseShot, type Measurement, type MeasurementId } from '../../engine/pose';
import { exampleFrames } from './example';
import { promptsFor } from './prompts';
import { synthesizeKick } from './synthetic';

const m = (id: MeasurementId, value: number, reliesOnDepth = false): Measurement => ({
  id,
  value,
  unit: 'm',
  frames: [0],
  reliesOnDepth,
});

function promptsOf(options: Parameters<typeof synthesizeKick>[0]) {
  const result = analyseShot(synthesizeKick(options));
  if (result.kind !== 'strike') throw new Error(result.kind);
  return promptsFor(result.measurements).map((p) => p.id);
}

describe('promptsFor', () => {
  it('ties each prompt to the measurement that raised it', () => {
    expect(promptsFor([m('plantFrontBack', 0.4)])).toEqual([
      { id: 'plantAhead', measurement: 'plantFrontBack' },
    ]);
    expect(promptsFor([m('plantFrontBack', 0), m('trunkLeanForward', 5)])).toEqual([]);
  });

  it('never raises a prompt from a number that leans on estimated depth', () => {
    expect(promptsFor([m('plantFrontBack', -1, true)])).toEqual([]);
    expect(promptsFor([m('plantSideways', 2, true), m('hipShoulderSeparation', 0, true)])).toEqual(
      [],
    );
  });

  it('reads known synthetic kicks the way a coach would expect', () => {
    expect(promptsOf({ plantForward: -0.4, trunkLean: -15 })).toEqual(['plantBehind', 'leanBack']);
    expect(promptsOf({ followThrough: 30, backswingKnee: 125 })).toEqual([
      'smallBackswing',
      'shortFollowThrough',
    ]);
    expect(promptsOf({ followThrough: 95 })).toEqual([]);
  });

  it('gives the example exactly one prompt, about the standing foot', () => {
    const result = analyseShot(exampleFrames());
    if (result.kind !== 'strike') throw new Error(result.kind);
    expect(promptsFor(result.measurements).map((p) => p.id)).toEqual(['plantBehind']);
  });
});
