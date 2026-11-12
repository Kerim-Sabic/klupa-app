import type { Mock } from 'vitest';
import { DRILLS } from '../../data/drills';
import type { AttendanceRow, ObservationRow, SessionDetail } from './api';
import { SESSION_ID, dbError } from './test-utils';

/** A tiny stand-in database so a save followed by a refetch shows what was saved. */
export const db = {
  detail: null as SessionDetail | null,
  attendance: [] as AttendanceRow[],
  observations: [] as ObservationRow[],
  failWrites: false,
};

export const DETAIL: SessionDetail = {
  session: {
    id: SESSION_ID,
    held_on: '2026-11-12',
    status: 'planned',
    focus: 'pressing',
    duration_minutes: 60,
    area: 'half',
    expected_players: 12,
    floodlit: false,
    source_match_id: null,
  },
  drills: [
    { id: 'd1', position: 1, drill_key: 'rondo-warmup', minutes: 10 },
    { id: 'd2', position: 2, drill_key: 'pressure-box', minutes: 30 },
    { id: 'd3', position: 3, drill_key: 'end-zone-game', minutes: 20 },
  ],
};

export const drillOf = (key: string) => {
  const drill = DRILLS.find((entry) => entry.key === key);
  if (drill === undefined) throw new Error(`Unknown drill ${key}`);
  return drill;
};

export function withStatus(status: 'planned' | 'completed' | 'cancelled'): SessionDetail {
  return { ...DETAIL, session: { ...DETAIL.session, status } };
}

export interface FakeApi {
  readonly fetchSession: Mock;
  readonly fetchAttendance: Mock;
  readonly fetchObservations: Mock;
  readonly updateSessionStatus: Mock;
  readonly upsertAttendance: Mock;
  readonly upsertObservation: Mock;
}

/** Empty the stand-in database and point the mocked api functions at it. */
export function resetDb(api: FakeApi): void {
  db.detail = DETAIL;
  db.attendance = [];
  db.observations = [];
  db.failWrites = false;
  api.fetchSession.mockImplementation(() => Promise.resolve(db.detail));
  api.fetchAttendance.mockImplementation(() => Promise.resolve([...db.attendance]));
  api.fetchObservations.mockImplementation(() => Promise.resolve([...db.observations]));
  api.updateSessionStatus.mockResolvedValue(undefined);
  api.upsertAttendance.mockImplementation(
    (
      _club: string,
      _session: string,
      playerId: string,
      value: Omit<AttendanceRow, 'player_id'>,
    ) => {
      if (db.failWrites) return Promise.reject(dbError());
      db.attendance = [
        ...db.attendance.filter((row) => row.player_id !== playerId),
        { player_id: playerId, ...value },
      ];
      return Promise.resolve();
    },
  );
  api.upsertObservation.mockImplementation(
    (
      _club: string,
      _session: string,
      playerId: string,
      _skill: string,
      tally: { attempts: number; successes: number },
    ) => {
      if (db.failWrites) return Promise.reject(dbError());
      db.observations = [
        ...db.observations.filter((row) => row.player_id !== playerId),
        { player_id: playerId, ...tally },
      ];
      return Promise.resolve();
    },
  );
}
