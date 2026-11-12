import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { expect, it } from 'vitest';
import {
  applyLineup,
  createMatch,
  fetchEvents,
  fetchGoals,
  fetchMatch,
  fetchStints,
  setMatchStatus,
  undoEvent,
  upsertEvent,
} from '../../src/features/matches/api';
import { liveEvents, mergeFeed } from '../../src/features/matches/feed';
import type { EventInsert } from '../../src/features/matches/model';
import { EMPTY_OUTBOX } from '../../src/features/matches/outbox';
import { eventWeight, toEvidenceList } from '../../src/features/matches/weights';
import { fetchReviewEvents, watchMatch, type FeedState } from '../../src/features/momentum/api';
import { fetchMatches } from '../../src/lib/data';
import { env } from '../../src/lib/env';
import { need, sum, type Scenario } from './support';

export function matchSteps(s: Scenario): void {
  it('lists the matches and reads one finished match with its events, stints and goals', async () => {
    const { clubId, teamId } = need(s.club, 'the club');
    const season = need(s.season, 'the season');
    const matches = await fetchMatches(clubId, teamId);
    expect(matches).toHaveLength(season.matches.length);
    expect(matches.map((m) => m.status)).toEqual(matches.map(() => 'finished'));
    const dates = matches.map((m) => m.played_on);
    expect([...dates].sort().reverse()).toEqual(dates);

    const first = need(matches[0], 'a match');
    const seeded = need(
      season.matches.find((m) => m.opponent === first.opponent),
      'the seeded match',
    );
    expect(await fetchMatch(clubId, first.id)).toEqual(first);
    expect(await fetchMatch(clubId, randomUUID())).toBeNull();

    const events = await fetchEvents(clubId, first.id);
    expect(events).toHaveLength(seeded.events.length);
    expect(new Set(events.map((e) => e.client_id))).toEqual(
      new Set(seeded.events.map((e) => e.clientId)),
    );
    const stints = await fetchStints(clubId, first.id);
    expect(stints).toHaveLength(seeded.stints.length);
    expect(stints.every((st) => st.off_seconds !== null)).toBe(true);

    const goals = await fetchGoals(
      clubId,
      matches.map((m) => m.id),
    );
    expect(goals).toHaveLength(
      sum(season.matches, (m) => m.events.filter((e) => e.kind === 'goal').length),
    );
    expect(goals.every((g) => g.kind === 'goal')).toBe(true);
    expect(toEvidenceList(events)).toHaveLength(events.length);
  });

  it('refuses an event on a scheduled match, then stores a retried event once', async () => {
    const { clubId, teamId } = need(s.club, 'the club');
    const matchId = await createMatch({
      clubId,
      teamId,
      opponent: 'Integration opponents',
      playedOn: need(s.today, 'today'),
      periodCount: 2,
      periodMinutes: 20,
    });
    s.liveMatchId = matchId;
    expect((await fetchMatch(clubId, matchId))?.status).toBe('scheduled');

    const row: EventInsert = {
      client_id: randomUUID(),
      club_id: clubId,
      match_id: matchId,
      period: 1,
      clock_seconds: 125,
      side: 'home',
      kind: 'goal',
      weight: eventWeight({ kind: 'goal', location: { x: 90, y: 50 } }),
      x: 90,
      y: 50,
      header: false,
    };
    await expect(upsertEvent(row)).rejects.toMatchObject({ code: '23514' });

    await setMatchStatus(clubId, matchId, 'live');
    await upsertEvent(row);
    await upsertEvent(row);
    const stored = await fetchEvents(clubId, matchId);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ client_id: row.client_id, kind: 'goal', x: 90, y: 50 });
    expect(await fetchGoals(clubId, [matchId])).toHaveLength(1);
  });

  it('undoes an event softly: kept as a record of the undo, hidden wherever it is read', async () => {
    const { clubId } = need(s.club, 'the club');
    const matchId = need(s.liveMatchId, 'the live match');
    const target = need((await fetchEvents(clubId, matchId))[0], 'the stored event');
    await undoEvent(clubId, matchId, target.client_id, new Date().toISOString());

    const after = await fetchEvents(clubId, matchId);
    expect(after[0]?.deleted_at).not.toBeNull();
    expect(liveEvents(mergeFeed(after, EMPTY_OUTBOX, matchId))).toEqual([]);
    expect(toEvidenceList(after)).toEqual([]);
    expect(await fetchGoals(clubId, [matchId])).toEqual([]);
    expect(await fetchReviewEvents(clubId, matchId)).toEqual([]);
    // A repeated undo is harmless.
    await undoEvent(clubId, matchId, target.client_id, new Date().toISOString());
  });

  it('opens, closes and deletes a stint, then finishes the match', async () => {
    const { clubId } = need(s.club, 'the club');
    const matchId = need(s.liveMatchId, 'the live match');
    const player = need(s.players?.[0], 'a player');
    await applyLineup(clubId, matchId, [
      { type: 'on', player: player.id, period: 1, on_seconds: 0 },
    ]);
    const open = need((await fetchStints(clubId, matchId))[0], 'the open stint');
    expect(open).toMatchObject({ player_id: player.id, period: 1, off_seconds: null });

    await applyLineup(clubId, matchId, [{ type: 'off', stint: open.id, off_seconds: 600 }]);
    expect((await fetchStints(clubId, matchId))[0]?.off_seconds).toBe(600);
    // A change that fails half-way stores nothing: the first step is undone with the second.
    const other = need(s.players?.[1], 'a second player');
    await expect(
      applyLineup(clubId, matchId, [
        { type: 'on', player: other.id, period: 1, on_seconds: 600 },
        { type: 'off', stint: crypto.randomUUID(), off_seconds: 900 },
      ]),
    ).rejects.toMatchObject({ code: '42501' });
    expect(await fetchStints(clubId, matchId)).toHaveLength(1);

    await applyLineup(clubId, matchId, [{ type: 'remove', stint: open.id }]);
    expect(await fetchStints(clubId, matchId)).toEqual([]);

    await setMatchStatus(clubId, matchId, 'finished');
    expect((await fetchMatch(clubId, matchId))?.status).toBe('finished');
    expect(await fetchGoals(clubId, [])).toEqual([]);

    // The state machine runs in the database: a new match cannot jump straight to finished.
    const { teamId } = need(s.club, 'the club');
    const skipped = await createMatch({
      clubId,
      teamId,
      opponent: 'Skipped ahead',
      playedOn: need(s.today, 'today'),
      periodCount: 2,
      periodMinutes: 20,
    });
    await expect(setMatchStatus(clubId, skipped, 'finished')).rejects.toMatchObject({
      code: '23514',
    });
  });

  it('tells a member when an event is recorded, through the live feed, and tells a stranger nothing', async () => {
    const { clubId, teamId } = need(s.club, 'the club');
    const matchId = await createMatch({
      clubId,
      teamId,
      opponent: 'FK Uzivo',
      playedOn: need(s.today, 'today'),
      periodCount: 2,
      periodMinutes: 25,
    });
    await setMatchStatus(clubId, matchId, 'live');

    let changes = 0;
    let state: FeedState = 'connecting';
    const stop = watchMatch(
      matchId,
      () => {
        changes += 1;
      },
      (next) => {
        state = next;
      },
    );
    // A stranger: a fresh demo account that belongs to no club, listening to the same match.
    const stranger = createClient(env.supabaseUrl, env.supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const demo = await stranger.auth.signInAnonymously();
    if (demo.error !== null) throw demo.error;
    let overheard = 0;
    let strangerState = 'connecting';
    const eavesdrop = stranger
      .channel(`stranger-${matchId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'match_events', filter: `match_id=eq.${matchId}` },
        () => {
          overheard += 1;
        },
      )
      .subscribe((status) => {
        strangerState = status;
      });
    try {
      await expect.poll(() => strangerState, { timeout: 30_000, interval: 200 }).toBe('SUBSCRIBED');
      await expect.poll(() => state, { timeout: 30_000, interval: 200 }).toBe('live');
      // "Subscribed" is acknowledged slightly before the feed starts delivering, so an event
      // recorded in that instant can be missed. The promise is that the page hears about
      // changes while it is live: record events until one is heard, a few seconds apart.
      const heard = async (): Promise<boolean> => {
        const before = changes;
        await upsertEvent({
          club_id: clubId,
          match_id: matchId,
          client_id: crypto.randomUUID(),
          period: 1,
          clock_seconds: 30,
          side: 'home',
          kind: 'corner',
          weight: eventWeight({ kind: 'corner', location: null }),
          x: null,
          y: null,
          header: false,
        });
        for (let waited = 0; waited < 5_000 && changes === before; waited += 200) {
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
        return changes > before;
      };
      let delivered = false;
      for (let attempt = 0; attempt < 5 && !delivered; attempt += 1) delivered = await heard();
      expect(delivered).toBe(true);
      // The member heard at least one change while the stranger was subscribed to the very
      // same filter. One more event and a pause, then: row-level security let none through.
      await heard();
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      expect(overheard).toBe(0);
    } finally {
      stop();
      await stranger.removeChannel(eavesdrop);
      await stranger.auth.signOut();
    }
  });
}
