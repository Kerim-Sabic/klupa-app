import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodeTracking, frameAt, parseTrackingMeta, type TrackingMeta } from '../tracking';

/**
 * Every match shipped in `public/data/tracking/index.json`: the index agrees with the
 * binary and its metadata, the binary decodes, and the physical-measures file covers the
 * same players. `tracking.test.ts` holds the golden test of the first match.
 */
const DIRECTORY = join(process.cwd(), 'public', 'data', 'tracking');
/** The converter's own margin: players and ball may stand this far outside the lines. */
const MARGIN_METRES = 5;
const SIDES = ['home', 'away'] as const;

interface IndexEntry {
  readonly id: string;
  readonly date: string;
  readonly competition: string;
  readonly home: string;
  readonly away: string;
  readonly score: readonly [number, number];
  readonly periods: readonly [number, number];
  readonly bytes: number;
  readonly sha256: string;
}

interface PhysicalRow {
  readonly side: string;
  readonly shirt: number;
  readonly name: string;
  readonly minutes: number;
  readonly distanceKm: number;
  readonly highSpeedKm: number;
  readonly sprints: number;
  readonly topSpeed: number;
}

interface Physical {
  readonly match: string;
  readonly definitions: Readonly<Record<string, unknown>>;
  readonly players: readonly PhysicalRow[];
  readonly totals: Readonly<Record<string, Readonly<Record<string, number>>>>;
}

function readJson(name: string): unknown {
  return JSON.parse(readFileSync(join(DIRECTORY, name), 'utf-8'));
}

const index = readJson('index.json') as readonly IndexEntry[];

/** Sample numbers (4 Hz) in the middle of up to three long ball-in-play runs of a period. */
function inPlaySamples(meta: unknown, period: number): number[] {
  const periods = (meta as { periods: { ballAliveRuns: [number, number][] }[] }).periods;
  const runs = (periods[period - 1]?.ballAliveRuns ?? []).filter(([a, b]) => b - a >= 40);
  const picks = [0, Math.floor(runs.length / 2), runs.length - 1];
  return [...new Set(picks)].flatMap((i) => {
    const run = runs[i];
    return run === undefined ? [] : [Math.floor((run[0] + run[1]) / 2)];
  });
}

const key = (row: { side: string; shirt: number }): string => `${row.side}:${String(row.shirt)}`;

describe('index.json', () => {
  it('lists the seven matches once each, in date order, with the documented fields', () => {
    expect(index).toHaveLength(7);
    expect(new Set(index.map((e) => e.id)).size).toBe(7);
    const dates = index.map((e) => e.date);
    expect(dates).toEqual([...dates].sort());
    for (const entry of index) {
      expect(Object.keys(entry)).toEqual([
        'id',
        'date',
        'competition',
        'home',
        'away',
        'score',
        'periods',
        'bytes',
        'sha256',
      ]);
      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(entry.home.length).toBeGreaterThan(0);
      expect(entry.away.length).toBeGreaterThan(0);
      expect(entry.home).not.toBe(entry.away);
      expect(entry.score.every((g) => Number.isInteger(g) && g >= 0)).toBe(true);
    }
  });
});

describe.each(index)('shipped match $id: $home v $away', (entry) => {
  const binary = readFileSync(join(DIRECTORY, `${entry.id}.bin`));
  const metaJson = readJson(`${entry.id}.json`);
  const meta: TrackingMeta = parseTrackingMeta(metaJson);
  const tracking = decodeTracking(new Uint8Array(binary).buffer, meta);
  const physical = readJson(`${entry.id}.physical.json`) as Physical;

  it('has the size and SHA-256 the index and the metadata state', () => {
    const digest = createHash('sha256').update(binary).digest('hex');
    expect(binary.byteLength).toBe(entry.bytes);
    expect(binary.byteLength).toBe(meta.bytes);
    expect(digest).toBe(entry.sha256);
    expect(digest).toBe((metaJson as { sha256: string }).sha256);
    expect((metaJson as { match: string }).match).toBe(`DFL-MAT-${entry.id}`);
  });

  it('keeps names and personal ids out of the binary metadata', () => {
    for (const row of meta.roster) {
      expect(Object.keys(row).sort()).toEqual(['shirt', 'side', 'slot']);
    }
    expect(JSON.stringify(metaJson)).not.toContain('DFL-OBJ');
  });

  it('decodes to two periods at 4 Hz with the durations of the index', () => {
    expect(meta.sampleRateHz).toBe(4);
    expect(meta.pitch).toEqual({ lengthMetres: 105, widthMetres: 68 });
    expect(meta.periods.map((p) => p.period)).toEqual([1, 2]);
    expect(meta.periods.map((p) => p.durationSeconds)).toEqual([...entry.periods]);
    expect(tracking.keepers).toHaveLength(2);
    expect(tracking.attack).toHaveLength(2);
    for (const side of SIDES) {
      expect(tracking.attack[0]?.[side]).toBe(-(tracking.attack[1]?.[side] ?? 0));
    }
  });

  it('has 20 to 23 objects, ball included, inside the pitch in sampled in-play frames', () => {
    const { lengthMetres, widthMetres } = meta.pitch;
    for (const period of [1, 2]) {
      const samples = inPlaySamples(metaJson, period);
      expect(samples.length).toBeGreaterThan(0);
      for (const sample of samples) {
        const frame = frameAt(tracking, period, sample / meta.sampleRateHz);
        const objects = frame.players.length + (frame.ball === null ? 0 : 1);
        expect(frame.ball).not.toBeNull();
        expect(objects).toBeGreaterThanOrEqual(20);
        expect(objects).toBeLessThanOrEqual(23);
        const points = [...frame.players, ...(frame.ball === null ? [] : [frame.ball])];
        for (const point of points) {
          expect(Math.abs(point.x)).toBeLessThanOrEqual(lengthMetres / 2 + MARGIN_METRES);
          expect(Math.abs(point.y)).toBeLessThanOrEqual(widthMetres / 2 + MARGIN_METRES);
        }
        expect(frame.players.filter((p) => p.side === 'home').length).toBeGreaterThanOrEqual(9);
        expect(frame.players.filter((p) => p.side === 'away').length).toBeGreaterThanOrEqual(9);
      }
    }
  });

  it('has a physical-measures row for every roster slot and none besides', () => {
    expect(physical.match).toBe(`DFL-MAT-${entry.id}`);
    const rows = physical.players.map(key);
    expect(new Set(rows).size).toBe(rows.length);
    expect([...rows].sort()).toEqual(meta.roster.map(key).sort());
    for (const side of SIDES) {
      const own = physical.players.filter((p) => p.side === side);
      expect(physical.totals[side]?.players).toBe(own.length);
    }
  });

  it('has plausible physical numbers and states its definitions', () => {
    for (const row of physical.players) {
      expect(row.name.trim().length).toBeGreaterThan(0);
      expect(row.minutes).toBeGreaterThan(0);
      expect(row.minutes).toBeLessThanOrEqual(100);
      expect(row.distanceKm).toBeGreaterThanOrEqual(0);
      expect(row.highSpeedKm).toBeLessThanOrEqual(row.distanceKm);
      expect(Number.isInteger(row.sprints)).toBe(true);
      expect(row.topSpeed).toBeGreaterThan(4);
      expect(row.topSpeed).toBeLessThan(11);
    }
    for (const side of SIDES) {
      const own = physical.players.filter((p) => p.side === side);
      const sum = own.reduce((total, p) => total + p.distanceKm, 0);
      expect(Math.abs((physical.totals[side]?.distanceKm ?? Number.NaN) - sum)).toBeLessThan(0.05);
      expect(physical.totals[side]?.sprints).toBe(own.reduce((total, p) => total + p.sprints, 0));
    }
    expect(physical.definitions).toMatchObject({
      sampleRateHz: 25,
      highSpeedMps: 5.5,
      sprintMps: 7,
      sprintSeconds: 1,
      jumpMps: 12,
    });
  });
});
