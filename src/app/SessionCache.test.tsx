import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from '../lib/auth';
import { SessionCache } from './SessionCache';

vi.mock('../lib/auth', () => ({ useAuth: vi.fn() }));

type Auth = ReturnType<typeof useAuth>;
const withState = (state: unknown): Auth => ({ state }) as unknown as Auth;
const signedIn = (id: string): Auth => withState({ status: 'signed-in', user: { id } });
const signedOut = withState({ status: 'signed-out' });
const loading = withState({ status: 'loading' });

function setup() {
  const client = new QueryClient();
  client.setQueryData(['players', 'team-1'], [{ id: 'p-1', label: 'Soko' }]);
  const tree = () => (
    <QueryClientProvider client={client}>
      <SessionCache />
    </QueryClientProvider>
  );
  const view = render(tree());
  return {
    client,
    show: () => {
      view.rerender(tree());
    },
  };
}

const cached = (client: QueryClient) => client.getQueryData(['players', 'team-1']);

beforeEach(() => {
  vi.resetAllMocks();
});

describe('SessionCache', () => {
  it('keeps what was read while the same coach stays signed in', () => {
    vi.mocked(useAuth).mockReturnValue(signedIn('coach-a'));
    const { client, show } = setup();
    show();
    expect(cached(client)).toBeDefined();
  });

  it('drops everything read from the server when the coach signs out', () => {
    vi.mocked(useAuth).mockReturnValue(signedIn('coach-a'));
    const { client, show } = setup();
    vi.mocked(useAuth).mockReturnValue(signedOut);
    show();
    expect(cached(client)).toBeUndefined();
  });

  it('drops it when a different account signs in on the same phone', () => {
    vi.mocked(useAuth).mockReturnValue(signedIn('coach-a'));
    const { client, show } = setup();
    vi.mocked(useAuth).mockReturnValue(signedIn('coach-b'));
    show();
    expect(cached(client)).toBeUndefined();
  });

  it('does not clear on the way in: loading, then signed in', () => {
    vi.mocked(useAuth).mockReturnValue(loading);
    const { client, show } = setup();
    vi.mocked(useAuth).mockReturnValue(signedIn('coach-a'));
    show();
    expect(cached(client)).toBeDefined();
  });
});
