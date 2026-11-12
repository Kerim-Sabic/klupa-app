import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { watchMatch, type FeedState } from './api';
import { useLiveMatch } from './useLiveMatch';

vi.mock('./api', () => ({ watchMatch: vi.fn() }));
vi.mock('../../lib/data', () => ({
  queryKeys: {
    match: (id: string) => ['match', id] as const,
    matchEvents: (id: string) => ['match-events', id] as const,
  },
}));

interface Feed {
  change: () => void;
  state: (next: FeedState) => void;
  stop: Mock<() => void>;
}

/** Captures what the hook handed to the database feed, so a test can play the feed's part. */
function fakeFeed(): Feed {
  const feed: Feed = {
    change: () => undefined,
    state: () => undefined,
    stop: vi.fn<() => void>(),
  };
  vi.mocked(watchMatch).mockImplementation((_matchId, onChange, onState) => {
    feed.change = onChange;
    feed.state = onState;
    return feed.stop;
  });
  return feed;
}

function setup(enabled: boolean, matchId = 'match-1') {
  const client = new QueryClient();
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const wrapper = ({ children }: { readonly children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const view = renderHook(
    (props: { enabled: boolean; matchId: string }) => useLiveMatch(props.matchId, props.enabled),
    { wrapper, initialProps: { enabled, matchId } },
  );
  return { ...view, invalidate };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('useLiveMatch', () => {
  it('does not follow a match that is over', () => {
    fakeFeed();
    const { result } = setup(false);
    expect(result.current).toBeNull();
    expect(watchMatch).not.toHaveBeenCalled();
  });

  it('follows the match and reports the state of the feed', () => {
    const feed = fakeFeed();
    const { result } = setup(true);
    expect(watchMatch).toHaveBeenCalledWith('match-1', expect.any(Function), expect.any(Function));
    expect(result.current).toBe('connecting');
    act(() => {
      feed.state('live');
    });
    expect(result.current).toBe('live');
    act(() => {
      feed.state('offline');
    });
    expect(result.current).toBe('offline');
  });

  it('reads the match and its events again whenever the database reports a change', () => {
    const feed = fakeFeed();
    const { invalidate } = setup(true);
    feed.change();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['match-events', 'match-1'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['match', 'match-1'] });
  });

  it('stops following when the page closes, the match ends, or another match is opened', () => {
    const feed = fakeFeed();
    const { rerender, unmount } = setup(true);
    rerender({ enabled: true, matchId: 'match-2' });
    expect(feed.stop).toHaveBeenCalledTimes(1);
    expect(watchMatch).toHaveBeenLastCalledWith(
      'match-2',
      expect.any(Function),
      expect.any(Function),
    );
    rerender({ enabled: false, matchId: 'match-2' });
    expect(feed.stop).toHaveBeenCalledTimes(2);
    unmount();
    expect(feed.stop).toHaveBeenCalledTimes(2);
  });
});
