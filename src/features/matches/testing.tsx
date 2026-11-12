import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionConfig, MotionGlobalConfig } from 'motion/react';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import type { ActiveClub } from '../../lib/club';
import type { MatchSummary, Player } from '../../lib/data';
import { ToastProvider } from '../../ui';
import type { EventInsert, EventRow, StintRow } from './model';
import type { OutboxItem } from './outbox';

/** Shared fixtures and a render helper for this feature's tests. Never imported by the app. */
MotionGlobalConfig.skipAnimations = true;

export const CLUB: ActiveClub = {
  clubId: 'club-1',
  clubName: 'FK Test',
  isDemo: true,
  role: 'coach',
  teamId: 'team-1',
  teamName: 'U11',
  ageGroup: 'u11',
};

export function makeMatch(overrides: Partial<MatchSummary> = {}): MatchSummary {
  return {
    id: 'match-1',
    opponent: 'Zvijezda',
    played_on: '2026-11-14',
    status: 'scheduled',
    period_count: 2,
    period_minutes: 25,
    ...overrides,
  };
}

export function makeInsert(overrides: Partial<EventInsert> = {}): EventInsert {
  return {
    client_id: 'c-1',
    club_id: CLUB.clubId,
    match_id: 'match-1',
    period: 1,
    clock_seconds: 60,
    side: 'home',
    kind: 'corner',
    weight: 250,
    x: null,
    y: null,
    header: false,
    ...overrides,
  };
}

export function makeRow(overrides: Partial<EventRow> = {}): EventRow {
  const { client_id: clientId = 'c-1' } = overrides;
  return {
    id: `id-${clientId}`,
    ...makeInsert({ client_id: clientId }),
    created_at: '2026-11-14T10:00:00.000Z',
    deleted_at: null,
    ...overrides,
  };
}

export function eventItem(
  insert: EventInsert,
  recordedAt = '2026-11-14T10:00:00.000Z',
): OutboxItem {
  return {
    id: insert.client_id,
    matchId: insert.match_id,
    recordedAt,
    op: { kind: 'event', row: insert },
  };
}

export function makeStint(overrides: Partial<StintRow> = {}): StintRow {
  return { id: 's-1', player_id: 'p-1', period: 1, on_seconds: 0, off_seconds: null, ...overrides };
}

export function makePlayer(id: string, shirt: number, label = `Player ${String(shirt)}`): Player {
  return {
    id,
    label,
    shirt_number: shirt,
    consent: 'granted',
    birth_quarter: null,
    archived_at: null,
  };
}

/** An error shaped like the one supabase-js throws for a database refusal. */
export function dbError(code: string): Error & { code: string } {
  return Object.assign(new Error(`database error ${code}`), { code });
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
}

/** Renders `ui` at `path`, with the providers the app root supplies and a fresh query client. */
export function renderAt(ui: ReactElement, { path = '/', route = '/' } = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  const user = userEvent.setup();
  const result = render(
    <QueryClientProvider client={client}>
      <MotionConfig reducedMotion="user">
        <ToastProvider>
          <MemoryRouter initialEntries={[route]}>
            <Routes>
              <Route path={path} element={ui} />
              <Route path="*" element={null} />
            </Routes>
            <LocationProbe />
          </MemoryRouter>
        </ToastProvider>
      </MotionConfig>
    </QueryClientProvider>,
  );
  return { ...result, user, client };
}
