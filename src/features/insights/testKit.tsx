import { QueryClient, QueryClientProvider, type UseQueryResult } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionConfig } from 'motion/react';
import { MemoryRouter, useLocation, useRoutes } from 'react-router';
import { vi } from 'vitest';
import { usePlayers, useSessions, type Player, type SessionSummary } from '../../lib/data';
import { ToastProvider } from '../../ui';
import {
  fetchClubFactors,
  fetchTeamAttendance,
  fetchTeamObservations,
  fetchTeamStints,
} from './api';
import { insightsRoutes } from './routes';
import type { AttendanceRecord, ClubFactors, ObservationRecord, StintRecord } from './types';

/*
 * Shared fixtures and a renderer for the insights tests. Children are labels and shirt
 * numbers here too: nothing in this file looks like a real person.
 */

export function player(shirt: number, birthQuarter: number | null = null): Player {
  return {
    id: `p${String(shirt)}`,
    label: `Player ${String(shirt)}`,
    shirt_number: shirt,
    consent: 'granted',
    birth_quarter: birthQuarter,
    archived_at: null,
  };
}

/** A stint from minute `on` to minute `off` of a match; null `off` leaves it open. */
export function stint(
  playerId: string,
  on: number,
  off: number | null,
  playedOn = '2026-11-08',
): StintRecord {
  return {
    player_id: playerId,
    on_seconds: on * 60,
    off_seconds: off === null ? null : off * 60,
    matches: { played_on: playedOn },
  };
}

interface AttendanceOptions {
  readonly minutes?: number | null;
  readonly rpe?: number | null;
  readonly status?: AttendanceRecord['status'];
  readonly sessionStatus?: AttendanceRecord['sessions']['status'];
}

export function attendance(
  playerId: string,
  sessionId: string,
  heldOn: string,
  options: AttendanceOptions = {},
): AttendanceRecord {
  return {
    player_id: playerId,
    session_id: sessionId,
    status: options.status ?? 'present',
    minutes: options.minutes === undefined ? 60 : options.minutes,
    rpe: options.rpe === undefined ? 5 : options.rpe,
    sessions: { held_on: heldOn, status: options.sessionStatus ?? 'completed' },
  };
}

export function observation(
  playerId: string,
  sessionId: string,
  attempts: number,
  successes: number,
): ObservationRecord {
  return { player_id: playerId, session_id: sessionId, attempts, successes };
}

export function session(
  id: string,
  heldOn: string,
  options: Partial<SessionSummary> = {},
): SessionSummary {
  return {
    id,
    held_on: heldOn,
    status: 'completed',
    focus: 'passing',
    duration_minutes: 60,
    area: 'full',
    expected_players: 12,
    floodlit: false,
    source_match_id: null,
    ...options,
  };
}

/** What a TanStack Query read returns, reduced to the parts the feature looks at. */
export function queryResult<T>(data: T | undefined, isError = false): UseQueryResult<T> {
  return { data, isError, refetch: vi.fn() } as unknown as UseQueryResult<T>;
}

export const NO_FACTORS: ClubFactors = {
  floodlight_kw: null,
  tariff_per_kwh: null,
  grid_kg_co2_per_kwh: null,
};

export interface Seed {
  /** 'loading' keeps the shared player read pending. */
  readonly players?: readonly Player[] | 'loading';
  readonly sessions?: readonly SessionSummary[];
  readonly stints?: readonly StintRecord[];
  readonly attendance?: readonly AttendanceRecord[];
  readonly observations?: readonly ObservationRecord[];
  readonly factors?: ClubFactors;
}

/**
 * Point the mocked reads at some rows. The test file mocks './api' and '../../lib/data'; this fills
 * them, so each test says only what is special about its squad.
 */
export function seed(rows: Seed = {}): void {
  vi.mocked(usePlayers).mockReturnValue(
    queryResult(rows.players === 'loading' ? undefined : [...(rows.players ?? [])]),
  );
  vi.mocked(useSessions).mockReturnValue(queryResult([...(rows.sessions ?? [])]));
  vi.mocked(fetchTeamStints).mockResolvedValue([...(rows.stints ?? [])]);
  vi.mocked(fetchTeamAttendance).mockResolvedValue([...(rows.attendance ?? [])]);
  vi.mocked(fetchTeamObservations).mockResolvedValue([...(rows.observations ?? [])]);
  vi.mocked(fetchClubFactors).mockResolvedValue(rows.factors ?? NO_FACTORS);
}

function Routes() {
  return useRoutes(insightsRoutes);
}

function Where() {
  return <output data-testid="where">{useLocation().pathname}</output>;
}

/** Renders the insights routes at a path with the providers the app root supplies. */
export function renderInsights(path = '/fairness') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const user = userEvent.setup();
  const view = render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MotionConfig reducedMotion="user">
          <MemoryRouter initialEntries={[path]}>
            <Routes />
            <Where />
          </MemoryRouter>
        </MotionConfig>
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { user, ...view };
}

/** The number a Stat announces to assistive technology, found by its label. */
export function statValue(label: string): string {
  const root = screen.getByText(label).parentElement;
  const announced = root?.querySelector('.sr-only');
  if (root === null || announced === null || announced === undefined) {
    throw new Error(`No stat "${label}"`);
  }
  return announced.textContent;
}

/** The cells of the table row whose first cell contains `text`, as plain strings. */
export function rowCells(table: HTMLElement, text: string): string[] {
  const row = within(table)
    .getAllByRole('row')
    .find((candidate) => within(candidate).queryAllByRole('cell')[0]?.textContent.includes(text));
  if (row === undefined) throw new Error(`No row for "${text}"`);
  return within(row)
    .getAllByRole('cell')
    .map((cell) => cell.lastElementChild?.textContent ?? '');
}
