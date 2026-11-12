import { expect, it } from 'vitest';
import { erasePlayer, insertPlayer } from '../../src/features/club/api';
import { buildValues } from '../../src/features/sessions/values';
import {
  fetchAttendance,
  fetchObservations,
  fetchSession,
  insertSession,
  updateSessionStatus,
  upsertAttendance,
  upsertObservation,
} from '../../src/features/sessions/api';
import { initialForm } from '../../src/features/sessions/constraints';
import { planFor } from '../../src/features/sessions/plan';
import {
  EMPTY_TALLY,
  EXPECTED,
  markStatus,
  setAttempts,
  setMinutes,
  setSuccesses,
  toggleEffort,
} from '../../src/features/sessions/tally';
import { fetchPlayers } from '../../src/lib/data';
import { countRows, need, type Scenario } from './support';

export function sessionSteps(s: Scenario): void {
  it('creates a session exactly as the planner does and reads it back', async () => {
    const club = need(s.club, 'the club');
    const players = need(s.players, 'the squad');
    const form = initialForm({ focus: null, squadSize: players.length, now: new Date() });
    const expected = need(planFor(form, club.ageGroup)?.scenarios[0]?.plan, 'a plan');
    const built = buildValues({
      form,
      plan: expected,
      playerIds: players.map((p) => p.id),
      sourceMatchId: need(s.liveMatchId, 'the match'),
    });
    if (!built.ok) throw new Error(`The planner values was refused: ${built.reason}`);

    const sessionId = await insertSession(club, built.values);
    const detail = need(await fetchSession(club.clubId, sessionId), 'the session');
    expect(detail.session).toMatchObject({
      held_on: form.heldOn,
      status: 'planned',
      focus: form.focus,
      duration_minutes: form.minutes,
      area: form.area,
      expected_players: form.players,
      floodlit: false,
      source_match_id: s.liveMatchId,
    });
    expect(detail.drills.map((d) => [d.position, d.drill_key, d.minutes])).toEqual(
      built.values.drills.map((d) => [d.position, d.drill_key, d.minutes]),
    );
    const attendance = await fetchAttendance(club.clubId, sessionId);
    expect(attendance).toHaveLength(players.length);
    expect(attendance.every((row) => row.status === 'expected')).toBe(true);
    expect(await fetchObservations(club.clubId, sessionId, form.focus)).toEqual([]);
    // A failure after the first insert must not leave half a plan behind.
    const before = await countRows('sessions', club.clubId);
    const broken = {
      ...built.values,
      drills: [{ position: 1, drill_key: 'NOT A KEY', minutes: 10 }],
    };
    await expect(insertSession(club, broken)).rejects.toMatchObject({ code: '23514' });
    expect(await countRows('sessions', club.clubId)).toBe(before);
    s.session = { id: sessionId, minutes: form.minutes, focus: form.focus };
  });

  it('changes attendance, effort and an observation through the session page functions', async () => {
    const { clubId, teamId } = need(s.club, 'the club');
    const players = need(s.players, 'the squad');
    const [first, second] = players;
    const player = need(first, 'a player');
    const { id: sessionId, minutes, focus: skill } = need(s.session, 'the session');
    const present = toggleEffort(setMinutes(markStatus(EXPECTED, 'present', minutes), 45), 7);
    await upsertAttendance(clubId, sessionId, player.id, present);
    const row = (await fetchAttendance(clubId, sessionId)).find((r) => r.player_id === player.id);
    expect(row).toMatchObject({ status: 'present', minutes: 45, rpe: 7 });

    // Absent clears minutes and effort, so the rating cannot feed the load figures.
    await upsertAttendance(clubId, sessionId, player.id, markStatus(present, 'absent', 60));
    const absent = (await fetchAttendance(clubId, sessionId)).find(
      (r) => r.player_id === player.id,
    );
    expect(absent).toMatchObject({ status: 'absent', minutes: null, rpe: null });

    // A player added after the plan has no row yet: the write must insert one.
    await insertPlayer({
      club_id: clubId,
      team_id: teamId,
      label: 'Late addition',
      shirt_number: 77,
    });
    const late = need(
      (await fetchPlayers(clubId, teamId)).find((p) => p.shirt_number === 77),
      'the late player',
    );
    await upsertAttendance(clubId, sessionId, late.id, markStatus(EXPECTED, 'present', 60));
    const withLate = await fetchAttendance(clubId, sessionId);
    expect(withLate).toHaveLength(players.length + 1);
    expect(withLate.find((r) => r.player_id === late.id)).toMatchObject({ status: 'present' });
    await erasePlayer(clubId, late.id);
    expect(await fetchAttendance(clubId, sessionId)).toHaveLength(players.length);

    const other = need(second, 'a second player');
    await upsertObservation(clubId, sessionId, other.id, skill, setAttempts(EMPTY_TALLY, 10));
    await upsertObservation(
      clubId,
      sessionId,
      other.id,
      skill,
      setSuccesses(setAttempts(EMPTY_TALLY, 12), 7),
    );
    const observed = await fetchObservations(clubId, sessionId, skill);
    expect(observed).toEqual([{ player_id: other.id, attempts: 12, successes: 7 }]);

    await updateSessionStatus(clubId, sessionId, 'completed');
    await updateSessionStatus(clubId, sessionId, 'completed');
    expect((await fetchSession(clubId, sessionId))?.session.status).toBe('completed');
  });
}
