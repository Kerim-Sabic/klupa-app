import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import {
  ProDataError,
  parseProIndex,
  parseProMatch,
  type ProIndex,
  type ProMatch,
} from '../../engine/pro';

const BASE = import.meta.env.BASE_URL;
export const PRO_INDEX_URL = `${BASE}data/pro/index.json`;
export const proMatchUrl = (id: number): string => `${BASE}data/pro/${String(id)}.json`;

export const proKeys = {
  index: ['pro', 'index'] as const,
  match: (id: number) => ['pro', 'match', id] as const,
};

async function getJson(url: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Could not load ${url} (${String(response.status)}).`);
  return response.json();
}

export async function fetchProIndex(signal: AbortSignal): Promise<ProIndex> {
  return parseProIndex(await getJson(PRO_INDEX_URL, signal));
}

export async function fetchProMatch(id: number, signal: AbortSignal): Promise<ProMatch> {
  const match = parseProMatch(await getJson(proMatchUrl(id), signal));
  if (match.id !== id) throw new ProDataError(`File for match ${String(id)} holds another match.`);
  return match;
}

/** A file that does not follow the contract will not follow it on a second try either. */
const retry = (failures: number, error: Error): boolean =>
  !(error instanceof ProDataError) && failures < 2;

/** The files never change under the same URL in one release: read once per visit. */
const STATIC = { staleTime: Infinity, gcTime: 30 * 60_000, retry } as const;

export function useProIndex(): UseQueryResult<ProIndex> {
  return useQuery({
    queryKey: proKeys.index,
    queryFn: ({ signal }) => fetchProIndex(signal),
    ...STATIC,
  });
}

/** One match; nothing is fetched until the caller knows the id is in the list. */
export function useProMatch(id: number, enabled: boolean): UseQueryResult<ProMatch> {
  return useQuery({
    queryKey: proKeys.match(id),
    queryFn: ({ signal }) => fetchProMatch(id, signal),
    enabled,
    ...STATIC,
  });
}
