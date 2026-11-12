import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { ActiveClub } from '../../lib/club';
import type { Player } from '../../lib/data';
import { DRILLS } from '../../data/drills';
import { ToastProvider } from '../../ui';
import { DEFAULT_EQUIPMENT, type PlannerForm } from './constraints';

export const CLUB: ActiveClub = {
  clubId: 'club-1',
  clubName: 'FK Primjer',
  isDemo: true,
  role: 'coach',
  teamId: 'team-1',
  teamName: 'U13',
  ageGroup: 'u13',
};

export const SESSION_ID = '11111111-1111-4111-8111-111111111111';
export const MATCH_ID = '22222222-2222-4222-8222-222222222222';

export function makePlayers(count: number): Player[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${String(index + 1)}`,
    label: `Player ${String(index + 1)}`,
    shirt_number: index + 1,
    consent: 'not_recorded' as const,
    birth_quarter: null,
    archived_at: null,
  }));
}

type QueryState<T> = 'pending' | 'error' | { readonly data: T };

/** Just enough of a query result for the screens, which only read these fields. */
export function queryResult<T>(state: QueryState<T>, refetch: () => void = () => undefined) {
  const base = { refetch };
  if (state === 'pending')
    return { ...base, isPending: true, isError: false, isSuccess: false, data: undefined };
  if (state === 'error')
    return { ...base, isPending: false, isError: true, isSuccess: false, data: undefined };
  return { ...base, isPending: false, isError: false, isSuccess: true, data: state.data };
}

/** Providers every screen needs, with a route table so navigation can be seen. */
export function renderAt(
  path: string,
  routes: readonly { readonly path: string; readonly element: ReactNode }[],
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            {routes.map((route) => (
              <Route key={route.path} path={route.path} element={route.element} />
            ))}
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

export const BASE_FORM: PlannerForm = {
  focus: 'receiving_under_pressure',
  heldOn: '2026-11-12',
  players: 12,
  minutes: 60,
  area: 'half',
  equipment: DEFAULT_EQUIPMENT,
  floodlit: false,
};

/** The English name of a library drill, so tests do not repeat the wording. */
export function drillName(key: string): string {
  const drill = DRILLS.find((entry) => entry.key === key);
  if (drill === undefined) throw new Error(`Unknown drill ${key}`);
  return drill.name.en;
}

/** A failure shaped like the database's, with the code `errorKey` reads. */
export function dbError(code = 'XX000'): Error {
  return Object.assign(new Error('database error'), { code });
}
