import type { Measurement, MeasurementId } from '../../engine/pose';

export type PromptId =
  'plantBehind' | 'plantAhead' | 'leanBack' | 'smallBackswing' | 'shortFollowThrough';

/** Something to look at on the video, tied to the measurement that raised it. Never a cause. */
export interface CoachingPrompt {
  readonly id: PromptId;
  readonly measurement: MeasurementId;
}

interface PromptRule extends CoachingPrompt {
  readonly raised: (value: number) => boolean;
}

/**
 * The engine measures; this is the coaching reading of those numbers. Thresholds are
 * deliberately simple starting points, not norms for any age, and every one is shown
 * next to the number that raised it so the coach can disagree. Numbers that lean on
 * estimated depth (rotation, sideways lean, sideways foot placement) never raise one.
 */
const RULES: readonly PromptRule[] = [
  { id: 'plantBehind', measurement: 'plantFrontBack', raised: (v) => v < -0.3 },
  { id: 'plantAhead', measurement: 'plantFrontBack', raised: (v) => v > 0.3 },
  { id: 'leanBack', measurement: 'trunkLeanForward', raised: (v) => v < -10 },
  { id: 'smallBackswing', measurement: 'kneeAtBackswing', raised: (v) => v > 120 },
  { id: 'shortFollowThrough', measurement: 'followThroughHeight', raised: (v) => v < -0.35 },
];

/** Prompts raised by a set of measurements, in a fixed order. */
export function promptsFor(measurements: readonly Measurement[]): CoachingPrompt[] {
  return RULES.flatMap((rule) => {
    const found = measurements.find((m) => m.id === rule.measurement);
    return found !== undefined && !found.reliesOnDepth && rule.raised(found.value)
      ? [{ id: rule.id, measurement: rule.measurement }]
      : [];
  });
}
