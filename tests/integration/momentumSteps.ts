import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { momentumSeries } from '../../src/engine';
import { fetchReviewEvents, fetchReviewMatch } from '../../src/features/momentum/api';
import { evidenceOf, reviewPeriods, scoreOf } from '../../src/features/momentum/reviewModel';
import { fetchMatches, fetchMatchPage, fetchSessionPage } from '../../src/lib/data';
import { need, type Scenario } from './support';

export function momentumSteps(s: Scenario): void {
  it('reads a seeded match for review and finds momentum readings', async () => {
    const { clubId, teamId } = need(s.club, 'the club');
    const season = need(s.season, 'the season');
    const seededMatch = need(
      (await fetchMatches(clubId, teamId)).find((m) =>
        season.matches.some((seeded) => seeded.opponent === m.opponent),
      ),
      'a seeded match',
    );
    expect(await fetchReviewMatch(clubId, randomUUID())).toBeNull();
    const match = need(await fetchReviewMatch(clubId, seededMatch.id), 'the review match');
    const events = await fetchReviewEvents(clubId, match.id);
    const seeded = need(
      season.matches.find((m) => m.opponent === match.opponent),
      'the seeded data',
    );
    expect(events).toHaveLength(seeded.events.length);
    const goals = seeded.events.filter((e) => e.kind === 'goal');
    expect(scoreOf(events).home + scoreOf(events).away).toBe(goals.length);

    const evidence = evidenceOf(events);
    const period = need(reviewPeriods(match, events)[0], 'period 1');
    const readings = momentumSeries(evidence, 1, period.durationSeconds, 5);
    expect(readings.length).toBeGreaterThan(0);
    expect(readings.some((reading) => reading.state !== 'insufficient')).toBe(true);
  });

  it('pages matches and sessions by key: the next page is exactly the rows after the key', async () => {
    const { clubId, teamId } = need(s.club, 'the club');
    const first = await fetchMatchPage(clubId, teamId, null);
    expect(first.rows.length).toBeGreaterThan(1);
    expect(first.next).toBeNull();
    const newest = need(first.rows[0], 'the newest match');
    const rest = await fetchMatchPage(clubId, teamId, { date: newest.played_on, id: newest.id });
    expect(rest.rows.map((row) => row.id)).toEqual(first.rows.slice(1).map((row) => row.id));

    const sessions = await fetchSessionPage(clubId, teamId, null);
    const latest = need(sessions.rows[0], 'the latest session');
    const older = await fetchSessionPage(clubId, teamId, { date: latest.held_on, id: latest.id });
    expect(older.rows.map((row) => row.id)).toEqual(sessions.rows.slice(1).map((row) => row.id));
  });
}
