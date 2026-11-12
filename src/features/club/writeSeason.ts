import type { Json } from '../../lib/database';
import type * as Api from './api';
import type { SeasonData } from './seedTypes';

/** The slice of `api.ts` the writer needs, so a test can stand in for the database. */
export type SeasonApi = Pick<typeof Api, 'importSeason'>;

export interface SeedTarget {
  readonly clubId: string;
  readonly teamId: string;
}

export interface SeasonSummary {
  readonly players: number;
  readonly matches: number;
  readonly events: number;
  readonly sessions: number;
}

/**
 * The season in the shape the database's `import_season` reads: its column names, with
 * players still referred to by their place in the list. The database turns places into ids.
 */
export function seasonPayload(data: SeasonData): Json {
  return {
    players: data.players.map((player) => ({
      label: player.label,
      shirt_number: player.shirtNumber,
      birth_quarter: player.birthQuarter,
    })),
    matches: data.matches.map((match) => ({
      opponent: match.opponent,
      played_on: match.playedOn,
      period_count: match.periodCount,
      period_minutes: match.periodMinutes,
      events: match.events.map((event) => ({
        client_id: event.clientId,
        period: event.period,
        clock_seconds: event.clockSeconds,
        side: event.side,
        kind: event.kind,
        weight: event.weight,
        player_index: event.playerIndex,
        x: event.x,
        y: event.y,
        header: event.header,
      })),
      stints: match.stints.map((stint) => ({
        player_index: stint.playerIndex,
        period: stint.period,
        on_seconds: stint.onSeconds,
        off_seconds: stint.offSeconds,
      })),
    })),
    sessions: data.sessions.map((session) => ({
      held_on: session.heldOn,
      focus: session.focus,
      duration_minutes: session.durationMinutes,
      area: session.area,
      expected_players: session.expectedPlayers,
      floodlit: session.floodlit,
      drills: session.drills.map((drill) => ({
        position: drill.position,
        drill_key: drill.drillKey,
        minutes: drill.minutes,
      })),
      attendance: session.attendance.map((row) => ({
        player_index: row.playerIndex,
        status: row.status,
        minutes: row.minutes,
        rpe: row.rpe,
      })),
      observations: session.observations.map((row) => ({
        player_index: row.playerIndex,
        skill: row.skill,
        attempts: row.attempts,
        successes: row.successes,
      })),
    })),
  };
}

/**
 * Stores a season in one database transaction, through the same rules a coach's own writes
 * meet. If any row is refused nothing is stored, and the database's error is thrown.
 */
export async function writeSeason(
  data: SeasonData,
  club: SeedTarget,
  api: SeasonApi,
): Promise<SeasonSummary> {
  await api.importSeason(club.clubId, club.teamId, seasonPayload(data));
  return {
    players: data.players.length,
    matches: data.matches.length,
    events: data.matches.reduce((sum, match) => sum + match.events.length, 0),
    sessions: data.sessions.length,
  };
}
