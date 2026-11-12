import type {
  AttendanceRecord,
  ObservationRecord,
  StintRecord,
} from '../../features/insights/types';
import type { MatchSummary, Player, SessionSummary } from '../../lib/data';
import type { ReviewEvent } from './matchModel';
import type { TodayInput } from './model';

/*
 * Small, readable rows for the Today tests. Players are a label and a number, as everywhere.
 * Shared by the model tests and the screen tests so both read the same season.
 */

export const TODAY = '2026-11-11';

export function player(id: string, shirt: number): Player {
  return {
    id,
    label: `Player ${String(shirt)}`,
    shirt_number: shirt,
    consent: 'granted',
    birth_quarter: null,
    archived_at: null,
  };
}

export function stint(
  playerId: string,
  minutes: number | null,
  playedOn = '2026-11-01',
): StintRecord {
  return {
    player_id: playerId,
    on_seconds: 0,
    off_seconds: minutes === null ? null : minutes * 60,
    matches: { played_on: playedOn },
  };
}

export function present(
  playerId: string,
  heldOn: string,
  minutes: number | null,
  rpe: number | null,
  sessionStatus: SessionSummary['status'] = 'completed',
): AttendanceRecord {
  return {
    player_id: playerId,
    session_id: `s-${heldOn}`,
    status: 'present',
    minutes,
    rpe,
    sessions: { held_on: heldOn, status: sessionStatus },
  };
}

export function observation(playerId: string, attempts: number, successes = 0): ObservationRecord {
  return { player_id: playerId, session_id: 's-1', attempts, successes };
}

export function match(
  id: string,
  playedOn: string,
  status: MatchSummary['status'] = 'finished',
): MatchSummary {
  return {
    id,
    opponent: `Opponent ${id}`,
    played_on: playedOn,
    status,
    period_count: 2,
    period_minutes: 1,
  };
}

export function session(
  id: string,
  heldOn: string,
  area: SessionSummary['area'] = 'full',
): SessionSummary {
  return {
    id,
    held_on: heldOn,
    status: 'completed',
    focus: 'build_up',
    duration_minutes: 60,
    area,
    expected_players: 10,
    floodlit: false,
    source_match_id: null,
  };
}

let nextEvent = 0;

export function event(
  side: ReviewEvent['side'],
  kind: ReviewEvent['kind'],
  clockSeconds: number,
  period = 1,
  weight = 700,
): ReviewEvent {
  nextEvent += 1;
  return {
    id: `e-${String(nextEvent)}`,
    period,
    clock_seconds: clockSeconds,
    side,
    kind,
    weight,
    x: null,
    y: null,
  };
}

export function emptyInput(overrides: Partial<TodayInput> = {}): TodayInput {
  return {
    players: [],
    matches: [],
    sessions: [],
    stints: [],
    attendance: [],
    observations: [],
    factors: { floodlight_kw: null, tariff_per_kwh: null, grid_kg_co2_per_kwh: null },
    today: TODAY,
    ...overrides,
  };
}
