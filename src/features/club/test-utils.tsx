import { QueryClient, QueryClientProvider, type UseQueryResult } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { vi } from 'vitest';
import type { ActiveClub } from '../../lib/club';
import type { Player } from '../../lib/data';
import { ToastProvider } from '../../ui';

export const CLUB: ActiveClub = {
  clubId: 'club-1',
  clubName: 'FK Sunce',
  isDemo: false,
  role: 'owner',
  teamId: 'team-1',
  teamName: 'Under-13s',
  ageGroup: 'u13',
};

export function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: 'p-1',
    label: 'Soko',
    shirt_number: 7,
    consent: 'granted',
    birth_quarter: 1,
    archived_at: null,
    ...overrides,
  };
}

/** A stand-in for a TanStack Query result with just the fields the screens read. */
export function queryResult<T>(
  state:
    | { kind: 'pending' }
    | { kind: 'error'; error: unknown; refetch?: () => Promise<unknown> }
    | { kind: 'success'; data: T },
): UseQueryResult<T> {
  const refetch = state.kind === 'error' ? (state.refetch ?? vi.fn()) : vi.fn();
  return {
    isPending: state.kind === 'pending',
    isError: state.kind === 'error',
    isSuccess: state.kind === 'success',
    data: state.kind === 'success' ? state.data : undefined,
    error: state.kind === 'error' ? state.error : null,
    refetch,
  } as unknown as UseQueryResult<T>;
}

/** Renders under the providers every screen expects; `/welcome` is a stand-in page. */
export function renderScreen(ui: ReactElement, route = '/') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MemoryRouter initialEntries={[route]}>
          <Routes>
            <Route path="/welcome" element={<p>Welcome page</p>} />
            <Route path="*" element={ui} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { ...view, queryClient };
}
