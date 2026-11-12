import { expect } from 'vitest';
import { DRILLS } from '../../data/drills';
import type { SeasonData } from './seedTypes';

const EVENT_KINDS = [
  'goal',
  'shot_on_target',
  'shot_off_target',
  'big_chance',
  'box_entry',
  'corner',
  'high_recovery',
  'lost_ball_own_half',
];
export const FIXED_WEIGHTS: Record<string, number> = {
  big_chance: 3500,
  box_entry: 300,
  corner: 250,
  high_recovery: 150,
  lost_ball_own_half: 150,
};
export const SHOT_KINDS = ['goal', 'shot_on_target', 'shot_off_target'];
const DRILL_KEYS = new Set(DRILLS.map((drill) => drill.key));
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Every rule the database enforces on this data, checked on the plain data. */
export function expectValidForDatabase(data: SeasonData, today: string): void {
  const shirts = new Set<number>();
  for (const player of data.players) {
    expect(player.label.length).toBeGreaterThanOrEqual(1);
    expect(player.label.length).toBeLessThanOrEqual(40);
    expect(Number.isInteger(player.shirtNumber)).toBe(true);
    expect(player.shirtNumber).toBeGreaterThanOrEqual(1);
    expect(player.shirtNumber).toBeLessThanOrEqual(99);
    expect([1, 2, 3, 4]).toContain(player.birthQuarter);
    shirts.add(player.shirtNumber);
  }
  expect(shirts.size).toBe(data.players.length);

  for (const match of data.matches) {
    expect(match.opponent.length).toBeGreaterThanOrEqual(1);
    expect(match.opponent.length).toBeLessThanOrEqual(60);
    expect(match.playedOn <= today).toBe(true);
    expect(match.periodCount).toBeGreaterThanOrEqual(1);
    expect(match.periodCount).toBeLessThanOrEqual(4);
    expect(match.periodMinutes).toBeGreaterThanOrEqual(5);
    expect(match.periodMinutes).toBeLessThanOrEqual(60);
    expect(match.events.length).toBeGreaterThanOrEqual(25);
    expect(match.events.length).toBeLessThanOrEqual(40);
    const clientIds = new Set<string>();
    for (const event of match.events) {
      expect(event.clientId).toMatch(UUID);
      clientIds.add(event.clientId);
      expect(event.period).toBeGreaterThanOrEqual(1);
      expect(event.period).toBeLessThanOrEqual(match.periodCount);
      expect(Number.isInteger(event.clockSeconds)).toBe(true);
      expect(event.clockSeconds).toBeGreaterThanOrEqual(0);
      expect(event.clockSeconds).toBeLessThanOrEqual(match.periodMinutes * 60);
      expect(['home', 'away']).toContain(event.side);
      expect(EVENT_KINDS).toContain(event.kind);
      expect(Number.isInteger(event.weight)).toBe(true);
      expect(event.weight).toBeGreaterThanOrEqual(0);
      expect(event.weight).toBeLessThanOrEqual(10_000);
      // The two coordinates are stored together or not at all.
      expect(event.x === null).toBe(event.y === null);
      if (event.x !== null && event.y !== null) {
        expect(Number.isInteger(event.x) && Number.isInteger(event.y)).toBe(true);
        expect(event.x).toBeGreaterThanOrEqual(0);
        expect(event.x).toBeLessThanOrEqual(100);
        expect(event.y).toBeGreaterThanOrEqual(0);
        expect(event.y).toBeLessThanOrEqual(100);
      }
    }
    expect(clientIds.size).toBe(match.events.length);
    for (const stint of match.stints) {
      expect(stint.period).toBeGreaterThanOrEqual(1);
      expect(stint.onSeconds).toBeGreaterThanOrEqual(0);
      expect(stint.offSeconds).toBeGreaterThan(stint.onSeconds);
      expect(stint.offSeconds).toBeLessThanOrEqual(match.periodMinutes * 60);
      expect(stint.playerIndex).toBeLessThan(data.players.length);
    }
  }

  expect(new Set(data.sessions.map((s) => s.heldOn)).size).toBe(data.sessions.length);
  for (const session of data.sessions) {
    expect(session.heldOn <= today).toBe(true);
    expect(session.focus).toMatch(/^[a-z0-9_]{2,40}$/);
    expect(session.durationMinutes).toBeGreaterThanOrEqual(10);
    expect(session.durationMinutes).toBeLessThanOrEqual(180);
    expect(session.expectedPlayers).toBeGreaterThanOrEqual(1);
    expect(session.expectedPlayers).toBeLessThanOrEqual(40);
    expect(['quarter', 'half', 'full']).toContain(session.area);
    expect(new Set(session.drills.map((d) => d.position)).size).toBe(session.drills.length);
    for (const drill of session.drills) {
      expect(drill.position).toBeGreaterThanOrEqual(1);
      expect(drill.position).toBeLessThanOrEqual(12);
      expect(drill.drillKey).toMatch(/^[a-z0-9-]{2,64}$/);
      expect(DRILL_KEYS.has(drill.drillKey)).toBe(true);
      expect(drill.minutes).toBeGreaterThanOrEqual(1);
      expect(drill.minutes).toBeLessThanOrEqual(120);
    }
    expect(new Set(session.attendance.map((a) => a.playerIndex)).size).toBe(
      session.attendance.length,
    );
    for (const row of session.attendance) {
      expect(['expected', 'present', 'absent']).toContain(row.status);
      if (row.minutes !== null) {
        expect(row.minutes).toBeGreaterThanOrEqual(0);
        expect(row.minutes).toBeLessThanOrEqual(180);
      }
      if (row.rpe !== null) {
        expect(Number.isInteger(row.rpe)).toBe(true);
        expect(row.rpe).toBeGreaterThanOrEqual(1);
        expect(row.rpe).toBeLessThanOrEqual(10);
      }
    }
    const watched = new Set<string>();
    for (const row of session.observations) {
      expect(row.skill).toMatch(/^[a-z0-9_]{2,40}$/);
      expect(row.attempts).toBeGreaterThanOrEqual(0);
      expect(row.attempts).toBeLessThanOrEqual(500);
      expect(row.successes).toBeGreaterThanOrEqual(0);
      expect(row.successes).toBeLessThanOrEqual(row.attempts);
      const key = `${String(row.playerIndex)}:${row.skill}`;
      expect(watched.has(key)).toBe(false);
      watched.add(key);
    }
  }
}
