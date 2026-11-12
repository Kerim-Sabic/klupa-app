import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { queryKeys, type MatchSummary } from '../../lib/data';
import type { EventRow } from './model';
import { loadOutbox, type OutboxItem } from './outbox';
import { eventItem, makeInsert, makeMatch, makeRow } from './testing';
import { FLUSH_INTERVAL_MS, useOnline, useOutbox } from './useOutbox';

function setup(send: (item: OutboxItem) => Promise<void>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, ...renderHook(() => useOutbox(send), { wrapper }) };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('useOutbox', () => {
  it('retries a waiting queue every 15 seconds', async () => {
    vi.useFakeTimers();
    const send = vi
      .fn<(item: OutboxItem) => Promise<void>>()
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValue();
    const { result } = setup(send);
    await act(async () => {
      result.current.add(eventItem(makeInsert({ client_id: 'a' })));
      await result.current.flushNow();
    });
    expect(result.current.queue.pending).toHaveLength(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(FLUSH_INTERVAL_MS);
    });
    expect(send).toHaveBeenCalledTimes(2);
    expect(result.current.queue.pending).toEqual([]);
    expect(loadOutbox().pending).toEqual([]);
  });

  it('writes what was sent into the cached events and match before refetching', async () => {
    const send = vi.fn<(item: OutboxItem) => Promise<void>>().mockResolvedValue();
    const { result, client } = setup(send);
    client.setQueryData<EventRow[]>(queryKeys.matchEvents('match-1'), [
      makeRow({ client_id: 'old' }),
    ]);
    client.setQueryData<MatchSummary>(queryKeys.match('match-1'), makeMatch());
    const seen: string[][] = [];
    const unsubscribe = client.getQueryCache().subscribe(() => {
      const rows = client.getQueryData<EventRow[]>(queryKeys.matchEvents('match-1'));
      seen.push((rows ?? []).map((row) => `${row.client_id}:${String(row.deleted_at !== null)}`));
    });
    await act(async () => {
      result.current.add(eventItem(makeInsert({ client_id: 'new' })));
      result.current.add({
        id: 'u',
        matchId: 'match-1',
        recordedAt: '2026-11-14T10:00:00Z',
        op: {
          kind: 'undo',
          clubId: 'club-1',
          matchId: 'match-1',
          clientId: 'old',
          deletedAt: '2026-11-14T10:00:00Z',
        },
      });
      result.current.add({
        id: 's',
        matchId: 'match-1',
        recordedAt: '2026-11-14T10:00:00Z',
        op: { kind: 'status', clubId: 'club-1', matchId: 'match-1', status: 'live' },
      });
      await result.current.flushNow();
    });
    unsubscribe();
    expect(seen.some((rows) => rows.includes('new:false') && rows.includes('old:true'))).toBe(true);
    expect(client.getQueryData<MatchSummary>(queryKeys.match('match-1'))?.status).toBe('live');
  });

  it('waits for a pass already running and runs once more for the new tap', async () => {
    let release: () => void = () => undefined;
    const send = vi
      .fn<(item: OutboxItem) => Promise<void>>()
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            release = resolve;
          }),
      )
      .mockResolvedValue();
    const { result } = setup(send);
    let first: Promise<void> = Promise.resolve();
    let second: Promise<void> = Promise.resolve();
    act(() => {
      result.current.add(eventItem(makeInsert({ client_id: 'a' })));
      first = result.current.flushNow();
      result.current.add(eventItem(makeInsert({ client_id: 'b' })));
      second = result.current.flushNow();
    });
    expect(second).toBe(first);
    await act(async () => {
      release();
      await second;
    });
    expect(send.mock.calls.map(([item]) => item.id)).toEqual(['a', 'b']);
    expect(result.current.peek().pending).toEqual([]);
  });

  it('retries a refused item on request and removes it on request', async () => {
    const refusal = Object.assign(new Error('refused'), { code: '42501' });
    const send = vi
      .fn<(item: OutboxItem) => Promise<void>>()
      .mockRejectedValueOnce(refusal)
      .mockRejectedValueOnce(refusal);
    const { result } = setup(send);
    await act(async () => {
      result.current.add(eventItem(makeInsert({ client_id: 'a' })));
      await result.current.flushNow();
    });
    expect(result.current.queue.failed).toHaveLength(1);
    act(() => {
      result.current.retry('a');
    });
    await waitFor(() => {
      expect(send).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(result.current.queue.failed).toHaveLength(1);
    });
    act(() => {
      result.current.dismiss('a');
    });
    expect(result.current.queue).toEqual({ pending: [], failed: [] });
  });
});

describe('useOnline', () => {
  it('follows the browser online and offline events', () => {
    const spy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    const { result } = renderHook(() => useOnline());
    expect(result.current).toBe(true);
    spy.mockReturnValue(false);
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(result.current).toBe(false);
    spy.mockRestore();
  });
});
