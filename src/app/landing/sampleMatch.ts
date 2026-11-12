import type { ReviewEvent } from '../../features/momentum/reviewModel';

type Sample = Pick<ReviewEvent, 'side' | 'kind' | 'weight' | 'clock_seconds'>;

/*
 * A made-up second half, written the way the tagger stores one: who, what, when, and the
 * weight the event carries as evidence. We lead 2-1 and have had more of the chances, so the
 * live match centre reads "we are on top".
 */
const SECOND_HALF: readonly Sample[] = [
  { side: 'home', kind: 'box_entry', weight: 300, clock_seconds: 95 },
  { side: 'home', kind: 'corner', weight: 250, clock_seconds: 170 },
  { side: 'home', kind: 'goal', weight: 3200, clock_seconds: 260 },
  { side: 'away', kind: 'box_entry', weight: 300, clock_seconds: 410 },
  { side: 'away', kind: 'goal', weight: 2400, clock_seconds: 505 },
  { side: 'home', kind: 'high_recovery', weight: 350, clock_seconds: 640 },
  { side: 'home', kind: 'shot_on_target', weight: 900, clock_seconds: 700 },
  { side: 'away', kind: 'shot_off_target', weight: 600, clock_seconds: 760 },
  { side: 'home', kind: 'big_chance', weight: 1800, clock_seconds: 815 },
  { side: 'home', kind: 'goal', weight: 3000, clock_seconds: 905 },
  { side: 'home', kind: 'shot_on_target', weight: 900, clock_seconds: 1010 },
  { side: 'home', kind: 'corner', weight: 250, clock_seconds: 1085 },
  { side: 'home', kind: 'box_entry', weight: 300, clock_seconds: 1140 },
];

/** The events of the example match, in the shape the live match centre reads. */
export const SAMPLE_EVENTS: readonly ReviewEvent[] = SECOND_HALF.map((event, index) => ({
  id: `sample-${String(index)}`,
  period: 2,
  x: null,
  y: null,
  ...event,
}));
