import { expect, it } from 'vitest';
import { createClubWithTeam } from '../../src/app/onboarding';
import * as clubApi from '../../src/features/club/api';
import { todayIso } from '../../src/features/club/model';
import { generateSeason } from '../../src/features/club/seed';
import { writeSeason } from '../../src/features/club/writeSeason';
import { fetchActiveClub } from '../../src/lib/club';
import { fetchPlayers } from '../../src/lib/data';
import { countRows, need, removeAllClubs, signIn, sum, type Scenario } from './support';

export function setupSteps(s: Scenario): void {
  it('signs in and clears clubs left over from an earlier run', async () => {
    s.userId = await signIn();
    await removeAllClubs(s.userId);
    expect(await fetchActiveClub(s.userId)).toBeNull();
  });

  it('creates a club and its U13 team in one call and reads them back', async () => {
    const userId = need(s.userId, 'the user id');
    const clubId = await createClubWithTeam({
      clubName: 'Klupa integration club',
      teamName: 'U13 integration',
      ageGroup: 'u13',
    });
    const club = need(await fetchActiveClub(userId), 'the new club');
    expect(club).toMatchObject({
      clubId,
      clubName: 'Klupa integration club',
      // Only a demo (anonymous) session gets a demo club; the database decides, not the caller.
      isDemo: false,
      role: 'owner',
      teamName: 'U13 integration',
      ageGroup: 'u13',
    });
    s.club = club;
  });

  it('writes the sample season and finds every row it generated', async () => {
    const club = need(s.club, 'the club');
    s.today = todayIso(new Date());
    const season = generateSeason({ seed: 20_261_112, today: s.today });
    s.season = season;
    const summary = await writeSeason(season, club, clubApi);

    const events = sum(season.matches, (m) => m.events.length);
    expect(summary).toEqual({
      players: season.players.length,
      matches: season.matches.length,
      events,
      sessions: season.sessions.length,
    });
    const { clubId } = club;
    expect(await countRows('players', clubId)).toBe(season.players.length);
    expect(await countRows('matches', clubId)).toBe(season.matches.length);
    expect(await countRows('match_events', clubId)).toBe(events);
    expect(await countRows('stints', clubId)).toBe(sum(season.matches, (m) => m.stints.length));
    expect(await countRows('sessions', clubId)).toBe(season.sessions.length);
    expect(await countRows('session_drills', clubId)).toBe(
      sum(season.sessions, (x) => x.drills.length),
    );
    expect(await countRows('session_attendance', clubId)).toBe(
      sum(season.sessions, (x) => x.attendance.length),
    );
    expect(await countRows('observations', clubId)).toBe(
      sum(season.sessions, (x) => x.observations.length),
    );
    s.players = await fetchPlayers(clubId, club.teamId);
    expect(s.players).toHaveLength(season.players.length);
  });
}
