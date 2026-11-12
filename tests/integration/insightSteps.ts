import { expect, it } from 'vitest';
import { buildOpportunityReport, reviewLoad, summariseResources } from '../../src/engine';
import { relativeAgeCheck } from '../../src/engine/relativeAge';
import {
  fetchClubFactors,
  fetchTeamAttendance,
  fetchTeamObservations,
  fetchTeamStints,
} from '../../src/features/insights/api';
import {
  MIN_ATTEMPTS,
  PRIOR_STRENGTH,
  buildFairShareModel,
  buildLoadModel,
  buildPitchModel,
} from '../../src/features/insights/models';
import {
  birthQuarterCounts,
  closedMatchMinutes,
  observationTotals,
  presentAttendance,
  squadIds,
  toExposures,
  toLoadEntries,
  toPitchSessions,
  toResourceSettings,
} from '../../src/features/insights/transform';
import { applyLineup, type LineupStep } from '../../src/features/matches/api';
import { fetchPlayers, fetchSessions } from '../../src/lib/data';
import { need, sum, type Scenario } from './support';

export function insightSteps(s: Scenario): void {
  it('finds the findings the sample season was designed to contain', async () => {
    const { clubId, teamId } = need(s.club, 'the club');
    const season = need(s.season, 'the season');
    const today = need(s.today, 'today');
    const [players, stints, attendance, observations, factors, sessions] = await Promise.all([
      fetchPlayers(clubId, teamId),
      fetchTeamStints(clubId, teamId),
      fetchTeamAttendance(clubId, teamId),
      fetchTeamObservations(clubId, teamId),
      fetchClubFactors(clubId),
      fetchSessions(clubId, teamId),
    ]);

    // The joined rows have the shape the transforms read (an embedded object, not a list).
    expect(stints).toHaveLength(sum(season.matches, (m) => m.stints.length));
    expect(stints.every((st) => /^\d{4}-\d{2}-\d{2}$/.test(st.matches.played_on))).toBe(true);
    expect(attendance.every((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.sessions.held_on))).toBe(true);
    expect(observations.length).toBeGreaterThanOrEqual(
      sum(season.sessions, (x) => x.observations.length),
    );
    expect(factors).toEqual({
      floodlight_kw: null,
      tariff_per_kwh: null,
      grid_kg_co2_per_kwh: null,
    });

    const squad = squadIds(players);
    const match = closedMatchMinutes(stints, squad);
    expect(match.openStints).toBe(0);
    const observed = observationTotals(observations, squad);
    const report = buildOpportunityReport(toExposures(players, match.minutes, observed), {
      priorStrength: PRIOR_STRENGTH,
      minAttempts: MIN_ATTEMPTS,
    });
    expect(report.rows.some((row) => row.minutes === 0)).toBe(true);
    expect(report.secondLook.length).toBeGreaterThan(0);

    const present = presentAttendance(attendance, squad);
    const entries = toLoadEntries(present.rows).filter((entry) => entry.date <= today);
    const review = reviewLoad(entries, { asOf: today });
    expect(review.filter((row) => row.status === 'sharp_increase')).toHaveLength(1);

    const pitch = toPitchSessions(sessions, attendance);
    const summary = summariseResources(pitch.sessions, toResourceSettings(factors));
    expect(summary.rightSizing.sessions.length).toBeGreaterThan(0);

    expect(relativeAgeCheck(birthQuarterCounts(players)).verdict).not.toBe('too_few');

    // The screens' own view models agree with the pieces above.
    const fairShare = buildFairShareModel({ players, stints, attendance, observations });
    expect(fairShare.playersWithMinutes).toBeLessThan(players.length);
    expect(fairShare.secondLook.length).toBeGreaterThan(0);
    expect(fairShare.relativeAge.status).toBe('ready');
    const load = buildLoadModel({ players, stints, attendance, today });
    expect(load.rows.filter((row) => row.status === 'sharp_increase')).toHaveLength(1);
    expect(
      buildPitchModel({ sessions, attendance, factors }).summary.rightSizing.sessions.length,
    ).toBeGreaterThan(0);
  });

  it('reads every page of a list longer than the server returns in one response', async () => {
    const { clubId, teamId } = need(s.club, 'the club');
    const matchId = need(s.liveMatchId, 'the match');
    const player = need(s.players?.[0], 'a player');
    const before = (await fetchTeamStints(clubId, teamId)).length;
    const extra = 1_150;
    const steps: LineupStep[] = Array.from({ length: extra }, (_, index) => ({
      type: 'on',
      player: player.id,
      period: 1,
      on_seconds: index,
    }));
    // One lineup change holds at most 60 steps.
    for (let start = 0; start < steps.length; start += 60) {
      await applyLineup(clubId, matchId, steps.slice(start, start + 60));
    }
    const all = await fetchTeamStints(clubId, teamId);
    expect(all).toHaveLength(before + extra);
    const attendance = await fetchTeamAttendance(clubId, teamId);
    expect(attendance.length).toBeGreaterThan(0);
  });
}
