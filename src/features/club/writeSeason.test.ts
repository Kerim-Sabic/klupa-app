import { describe, expect, it, vi } from 'vitest';
import { generateSeason } from './seed';
import type { SeasonData } from './seedTypes';
import { seasonPayload, writeSeason, type SeasonApi } from './writeSeason';

const CLUB = { clubId: 'club-1', teamId: 'team-1' };

const DATA: SeasonData = {
  players: [
    { label: 'Soko', shirtNumber: 1, birthQuarter: 1 },
    { label: 'Vuk', shirtNumber: 7, birthQuarter: 4 },
  ],
  matches: [
    {
      opponent: 'FK Sample',
      playedOn: '2026-11-01',
      periodCount: 2,
      periodMinutes: 25,
      events: [
        {
          clientId: '00000000-0000-4000-8000-000000000001',
          period: 1,
          clockSeconds: 60,
          side: 'home',
          kind: 'goal',
          weight: 3000,
          playerIndex: 1,
          x: 90,
          y: 50,
          header: false,
        },
        {
          clientId: '00000000-0000-4000-8000-000000000002',
          period: 2,
          clockSeconds: 30,
          side: 'away',
          kind: 'corner',
          weight: 250,
          playerIndex: null,
          x: null,
          y: null,
          header: false,
        },
      ],
      stints: [{ playerIndex: 0, period: 1, onSeconds: 0, offSeconds: 1500 }],
    },
  ],
  sessions: [
    {
      heldOn: '2026-11-03',
      focus: 'first_touch',
      durationMinutes: 60,
      area: 'half',
      expectedPlayers: 2,
      floodlit: true,
      drills: [{ position: 1, drillKey: 'rondo-4v2', minutes: 15 }],
      attendance: [{ playerIndex: 0, status: 'present', minutes: 60, rpe: 6 }],
      observations: [{ playerIndex: 1, skill: 'first_touch', attempts: 10, successes: 4 }],
    },
  ],
};

function fakeApi(): SeasonApi & { importSeason: ReturnType<typeof vi.fn> } {
  return { importSeason: vi.fn(() => Promise.resolve()) };
}

describe('seasonPayload', () => {
  it('uses the database column names and keeps players as places in the list', () => {
    expect(seasonPayload(DATA)).toEqual({
      players: [
        { label: 'Soko', shirt_number: 1, birth_quarter: 1 },
        { label: 'Vuk', shirt_number: 7, birth_quarter: 4 },
      ],
      matches: [
        {
          opponent: 'FK Sample',
          played_on: '2026-11-01',
          period_count: 2,
          period_minutes: 25,
          events: [
            {
              client_id: '00000000-0000-4000-8000-000000000001',
              period: 1,
              clock_seconds: 60,
              side: 'home',
              kind: 'goal',
              weight: 3000,
              player_index: 1,
              x: 90,
              y: 50,
              header: false,
            },
            {
              client_id: '00000000-0000-4000-8000-000000000002',
              period: 2,
              clock_seconds: 30,
              side: 'away',
              kind: 'corner',
              weight: 250,
              player_index: null,
              x: null,
              y: null,
              header: false,
            },
          ],
          stints: [{ player_index: 0, period: 1, on_seconds: 0, off_seconds: 1500 }],
        },
      ],
      sessions: [
        {
          held_on: '2026-11-03',
          focus: 'first_touch',
          duration_minutes: 60,
          area: 'half',
          expected_players: 2,
          floodlit: true,
          drills: [{ position: 1, drill_key: 'rondo-4v2', minutes: 15 }],
          attendance: [{ player_index: 0, status: 'present', minutes: 60, rpe: 6 }],
          observations: [{ player_index: 1, skill: 'first_touch', attempts: 10, successes: 4 }],
        },
      ],
    });
  });

  it('survives the trip to the database unchanged, for the real sample season', () => {
    const payload = seasonPayload(generateSeason({ seed: 20_261_112, today: '2026-11-12' }));
    // Nothing undefined, no dates or other objects JSON would rewrite.
    expect(JSON.parse(JSON.stringify(payload))).toEqual(payload);
  });

  it('stays inside what one import accepts', () => {
    const season = generateSeason({ seed: 20_261_112, today: '2026-11-12' });
    expect(season.players.length).toBeLessThanOrEqual(40);
    expect(season.matches.length).toBeLessThanOrEqual(20);
    expect(season.sessions.length).toBeLessThanOrEqual(60);
    // The database accepts at most 600 events a minute from one account.
    const events = season.matches.reduce((sum, match) => sum + match.events.length, 0);
    expect(events).toBeLessThan(600);
  });
});

describe('writeSeason', () => {
  it('sends the whole season as one import for this club and team', async () => {
    const api = fakeApi();
    const summary = await writeSeason(DATA, CLUB, api);
    expect(api.importSeason).toHaveBeenCalledTimes(1);
    expect(api.importSeason).toHaveBeenCalledWith('club-1', 'team-1', seasonPayload(DATA));
    expect(summary).toEqual({ players: 2, matches: 1, events: 2, sessions: 1 });
  });

  it('passes the database error on and does not try again', async () => {
    const api = fakeApi();
    api.importSeason.mockRejectedValue({ code: '42501' });
    await expect(writeSeason(DATA, CLUB, api)).rejects.toMatchObject({ code: '42501' });
    expect(api.importSeason).toHaveBeenCalledTimes(1);
  });
});
