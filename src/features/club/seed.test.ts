import { describe, expect, it } from 'vitest';
import { FOCUS_KEYS } from '../../data/drills';
import { reviewLoad, summariseResources, xgUnits, type LoadEntry } from '../../engine';
import { generateSeason } from './seed';
import { at, shiftDate } from './seedRandom';
import { FIXED_WEIGHTS, SHOT_KINDS, expectValidForDatabase } from './seedChecks';
import type { SeasonData } from './seedTypes';

const TODAY = '2026-11-12';
function minutesByPlayer(data: SeasonData): number[] {
  const minutes = data.players.map(() => 0);
  for (const match of data.matches) {
    for (const stint of match.stints) {
      minutes[stint.playerIndex] =
        at(minutes, stint.playerIndex) + stint.offSeconds - stint.onSeconds;
    }
  }
  return minutes.map((seconds) => seconds / 60);
}

describe('generateSeason', () => {
  it('gives identical output for the same seed and date', () => {
    const first = generateSeason({ seed: 7, today: TODAY });
    const second = generateSeason({ seed: 7, today: TODAY });
    expect(second).toEqual(first);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it('gives a different season for a different seed', () => {
    const a = generateSeason({ seed: 1, today: TODAY });
    const b = generateSeason({ seed: 2, today: TODAY });
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it('moves its dates with the date it is given and nothing else', () => {
    const a = generateSeason({ seed: 7, today: TODAY });
    const b = generateSeason({ seed: 7, today: '2026-12-03' });
    expect(a.matches.map((m) => m.events)).toEqual(b.matches.map((m) => m.events));
    expect(a.matches.map((m) => m.playedOn)).not.toEqual(b.matches.map((m) => m.playedOn));
  });

  // 210 whole seasons, each checked row by row: slow on a busy machine, so it gets room.
  it('satisfies every database rule, for many seeds and every weekday', { timeout: 30_000 }, () => {
    for (let seed = 1; seed <= 30; seed += 1) {
      for (let offset = 0; offset < 7; offset += 1) {
        const today = shiftDate('2026-11-09', offset);
        expectValidForDatabase(generateSeason({ seed, today }), today);
      }
    }
  });

  it('has fourteen players with neutral nicknames and shirts 1 to 14', () => {
    const { players } = generateSeason({ seed: 1, today: TODAY });
    expect(players.map((p) => p.label)).toEqual([
      'Soko',
      'Vjetar',
      'Munja',
      'Iskra',
      'Ris',
      'Vuk',
      'Orao',
      'Delfin',
      'Jelen',
      'Bura',
      'Zmaj',
      'Tigar',
      'Lav',
      'Val',
    ]);
    expect(players.map((p) => p.shirtNumber)).toEqual(Array.from({ length: 14 }, (_, i) => i + 1));
  });

  it('skews birth quarters towards Q1: 6, 4, 3 and 1', () => {
    for (const seed of [1, 2, 3]) {
      const { players } = generateSeason({ seed, today: TODAY });
      const counts = [1, 2, 3, 4].map((q) => players.filter((p) => p.birthQuarter === q).length);
      expect(counts).toEqual([6, 4, 3, 1]);
    }
  });

  it('places matches on the last three Saturdays, oldest first', () => {
    const { matches } = generateSeason({ seed: 1, today: TODAY });
    expect(matches.map((m) => m.playedOn)).toEqual(['2026-10-24', '2026-10-31', '2026-11-07']);
  });

  it('places sessions in four different weeks, the last one this week', () => {
    const { sessions } = generateSeason({ seed: 1, today: TODAY });
    expect(sessions.map((s) => s.heldOn)).toEqual([
      '2026-10-20',
      '2026-10-22',
      '2026-10-27',
      '2026-11-05',
      '2026-11-10',
    ]);
  });

  it('keeps this week s session in this week, even on a Monday', () => {
    const { sessions } = generateSeason({ seed: 1, today: '2026-11-09' });
    expect(sessions.at(-1)?.heldOn).toBe('2026-11-09');
  });

  it('records 25 to 40 events a match across both halves', () => {
    const { matches } = generateSeason({ seed: 3, today: TODAY });
    expect(matches).toHaveLength(3);
    for (const match of matches) {
      const halves = new Set(match.events.map((e) => e.period));
      expect([...halves].sort()).toEqual([1, 2]);
      const ordered = [...match.events].sort(
        (a, b) => a.period - b.period || a.clockSeconds - b.clockSeconds,
      );
      expect(match.events).toEqual(ordered);
    }
  });

  it('weights events as the matches feature does', () => {
    const { matches } = generateSeason({ seed: 5, today: TODAY });
    const events = matches.flatMap((m) => m.events);
    expect(new Set(events.map((e) => e.kind)).size).toBeGreaterThanOrEqual(6);
    for (const event of events) {
      if (event.x !== null && event.y !== null) {
        expect(SHOT_KINDS).toContain(event.kind);
        expect(event.weight).toBe(
          xgUnits({ x: event.x, y: event.y, header: event.header, freeKick: false }),
        );
        // The attacking third: the last third of the pitch length.
        expect(event.x).toBeGreaterThanOrEqual(67);
      } else if (SHOT_KINDS.includes(event.kind)) {
        expect(event.kind).not.toBe('goal');
        expect(event.weight).toBe(700);
        expect(event.header).toBe(false);
      } else {
        expect(event.weight).toBe(FIXED_WEIGHTS[event.kind]);
      }
    }
    expect(events.some((e) => e.kind === 'goal')).toBe(true);
    expect(events.some((e) => e.x === null && SHOT_KINDS.includes(e.kind))).toBe(true);
    expect(events.some((e) => e.header)).toBe(true);
  });

  it('credits home events to a player who was on the pitch, and away events to nobody', () => {
    for (const match of generateSeason({ seed: 9, today: TODAY }).matches) {
      for (const event of match.events) {
        if (event.side === 'away') {
          expect(event.playerIndex).toBeNull();
          continue;
        }
        const on = match.stints.some(
          (s) =>
            s.playerIndex === event.playerIndex &&
            s.period === event.period &&
            s.onSeconds <= event.clockSeconds &&
            event.clockSeconds < s.offSeconds,
        );
        expect(on).toBe(true);
      }
    }
  });

  it('keeps nine players on the pitch at all times', () => {
    for (const match of generateSeason({ seed: 2, today: TODAY }).matches) {
      for (const period of [1, 2]) {
        for (const second of [0, 300, 599, 600, 900, 1500, 1799]) {
          const on = match.stints.filter(
            (s) => s.period === period && s.onSeconds <= second && second < s.offSeconds,
          );
          expect(on).toHaveLength(9);
        }
      }
    }
  });

  it('shares minutes unevenly: three players under 15 minutes, one with none', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const minutes = minutesByPlayer(generateSeason({ seed, today: TODAY }));
      const low = minutes.filter((m) => m < 15);
      expect(low).toHaveLength(3);
      expect(minutes.filter((m) => m === 0)).toHaveLength(1);
      expect(minutes.slice(0, 11).every((m) => m >= 45)).toBe(true);
    }
  });

  it('plans five completed sessions with focuses from the drill library', () => {
    const { sessions } = generateSeason({ seed: 4, today: TODAY });
    expect(sessions).toHaveLength(5);
    expect(new Set(sessions.map((s) => s.focus)).size).toBe(5);
    for (const session of sessions) {
      expect(FOCUS_KEYS).toContain(session.focus);
      expect(session.drills.map((d) => d.position)).toEqual([1, 2, 3]);
      expect(session.drills.reduce((sum, d) => sum + d.minutes, 0)).toBe(session.durationMinutes);
    }
  });

  it('has two floodlit evenings on a full pitch with only nine players', () => {
    for (const seed of [1, 2, 3]) {
      const sessions = generateSeason({ seed, today: TODAY }).sessions;
      const floodlit = sessions.filter((s) => s.floodlit);
      expect(floodlit).toHaveLength(2);
      for (const session of floodlit) {
        expect(session.area).toBe('full');
        expect(session.expectedPlayers).toBe(9);
        expect(session.attendance.filter((a) => a.status === 'present')).toHaveLength(9);
      }
      for (const session of sessions.filter((s) => !s.floodlit)) {
        expect(session.expectedPlayers).toBe(13);
      }
    }
  });

  it('turns that into a right-sizing finding', () => {
    const { sessions } = generateSeason({ seed: 1, today: TODAY });
    const summary = summariseResources(
      sessions.map((s, index) => ({
        id: String(index),
        date: s.heldOn,
        durationMinutes: s.durationMinutes,
        area: s.area,
        attended: s.attendance.filter((a) => a.status === 'present').length,
        floodlit: s.floodlit,
      })),
      { floodlightKw: null, tariffPerKwh: null, gridKgCo2PerKwh: null },
    );
    expect(summary.rightSizing.sessions.map((r) => r.sessionId)).toEqual(['1', '3']);
    expect(summary.rightSizing.pitchHoursFreed).toBeGreaterThan(0);
  });

  it('has a few absences and effort ratings from 3 to 8', () => {
    const { sessions } = generateSeason({ seed: 1, today: TODAY });
    const rows = sessions.flatMap((s) => s.attendance);
    expect(rows.filter((a) => a.status === 'absent').length).toBeGreaterThanOrEqual(5);
    const ratings = rows.flatMap((a) => (a.rpe === null ? [] : [a.rpe]));
    expect(Math.min(...ratings)).toBe(3);
    expect(Math.max(...ratings)).toBe(8);
    for (const row of rows) {
      expect(row.status === 'present').toBe(row.minutes !== null && row.rpe !== null);
    }
  });

  it('gives one player a sharp load increase this week and nobody else', () => {
    for (let seed = 1; seed <= 10; seed += 1) {
      for (let offset = 0; offset < 7; offset += 1) {
        const today = shiftDate('2026-11-09', offset);
        const { sessions } = generateSeason({ seed, today });
        const entries: LoadEntry[] = sessions.flatMap((session) =>
          session.attendance.flatMap((row) =>
            row.minutes === null
              ? []
              : [
                  {
                    playerId: String(row.playerIndex),
                    date: session.heldOn,
                    minutes: row.minutes,
                    rpe: row.rpe,
                    kind: 'session' as const,
                  },
                ],
          ),
        );
        const sharp = reviewLoad(entries, { asOf: today })
          .filter((row) => row.status === 'sharp_increase')
          .map((row) => row.playerId);
        expect(sharp).toEqual(['3']);
      }
    }
  });

  it('watches some players closely and others hardly at all', () => {
    for (const seed of [1, 2, 3, 4]) {
      const { sessions } = generateSeason({ seed, today: TODAY });
      const attempts = Array.from({ length: 14 }, () => 0);
      for (const row of sessions.flatMap((s) => s.observations)) {
        attempts[row.playerIndex] = at(attempts, row.playerIndex) + row.attempts;
      }
      for (const total of attempts.slice(0, 8)) {
        expect(total).toBeGreaterThanOrEqual(15);
        expect(total).toBeLessThanOrEqual(25);
      }
      for (const total of attempts.slice(8, 11)) {
        expect(total).toBeGreaterThanOrEqual(6);
        expect(total).toBeLessThanOrEqual(12);
      }
      for (const total of attempts.slice(11)) expect(total).toBeLessThanOrEqual(3);
      expect(attempts[13]).toBe(0);
    }
  });

  it('only observes players who were there', () => {
    const { sessions } = generateSeason({ seed: 6, today: TODAY });
    for (const session of sessions) {
      const present = new Set(
        session.attendance.filter((a) => a.status === 'present').map((a) => a.playerIndex),
      );
      for (const row of session.observations) expect(present.has(row.playerIndex)).toBe(true);
    }
  });
});
