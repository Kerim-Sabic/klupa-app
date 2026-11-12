import { z } from 'zod';
import type { Side } from '../../engine/types';

/**
 * The physical report of one match (`<id>.physical.json`), measured by the research
 * pipeline from the full 25 Hz tracking. Only the fields the screen shows are validated;
 * the thresholds in `definitions` are read so the screen states the file's own numbers.
 */
const side = z.enum(['home', 'away']);

const playerSchema = z.object({
  side,
  shirt: z.number().int().min(0),
  name: z.string(),
  minutes: z.number().min(0),
  distanceKm: z.number().min(0),
  highSpeedKm: z.number().min(0),
  sprints: z.number().int().min(0),
  topSpeed: z.number().min(0),
});

const totalsSchema = z.object({
  players: z.number().int().min(0),
  minutes: z.number().min(0),
  distanceKm: z.number().min(0),
  highSpeedKm: z.number().min(0),
  sprints: z.number().int().min(0),
  topSpeed: z.number().min(0),
});

const physicalSchema = z.object({
  formatVersion: z.literal(1),
  match: z.string(),
  definitions: z.object({
    sampleRateHz: z.number().positive(),
    highSpeedMps: z.number().positive(),
    sprintMps: z.number().positive(),
    sprintSeconds: z.number().positive(),
    jumpMps: z.number().positive(),
  }),
  quality: z.object({
    excludedPlayerSeconds: z.number().min(0),
    shareOfPlayerTime: z.number().min(0).max(1),
  }),
  players: z.array(playerSchema),
  totals: z.object({ home: totalsSchema, away: totalsSchema }),
});

export type PhysicalReport = z.infer<typeof physicalSchema>;
export type PhysicalPlayer = z.infer<typeof playerSchema>;
export type PhysicalTotals = z.infer<typeof totalsSchema>;

export function parsePhysical(value: unknown): PhysicalReport {
  return physicalSchema.parse(value);
}

/** Metres per second to kilometres per hour. */
export function kmh(mps: number): number {
  return mps * 3.6;
}

export type ComparisonKey = 'distanceKm' | 'highSpeedKm' | 'sprints' | 'topSpeed';
export const COMPARISON_KEYS: readonly ComparisonKey[] = [
  'distanceKm',
  'highSpeedKm',
  'sprints',
  'topSpeed',
];

export interface ComparisonRow {
  readonly key: ComparisonKey;
  readonly values: Readonly<Record<Side, number>>;
  /** Each side's bar length, 0 to 1, against the larger of the two. */
  readonly shares: Readonly<Record<Side, number>>;
}

/** One row per measure, for the mirrored team comparison. Top speed stays in m/s here. */
export function compareTeams(report: PhysicalReport): ComparisonRow[] {
  return COMPARISON_KEYS.map((key) => {
    const home = report.totals.home[key];
    const away = report.totals.away[key];
    const top = Math.max(home, away);
    return {
      key,
      values: { home, away },
      shares: { home: top > 0 ? home / top : 0, away: top > 0 ? away / top : 0 },
    };
  });
}

/** The players of one side, as the table shows them. */
export function playersOf(report: PhysicalReport, which: Side): PhysicalPlayer[] {
  return report.players.filter((player) => player.side === which);
}
