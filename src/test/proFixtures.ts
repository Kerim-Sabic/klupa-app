import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseProIndex, parseProMatch, type ProIndex, type ProMatch } from '../engine/pro';

/** Test-only access to the shipped pro data and the Python golden numbers, read from disk. */
const ROOT = join(import.meta.dirname, '..', '..');

export function readJson(...parts: string[]): unknown {
  return JSON.parse(readFileSync(join(ROOT, ...parts), 'utf8'));
}

export function rawMatch(id: number | string): unknown {
  return readJson('public', 'data', 'pro', `${String(id)}.json`);
}

const cache = new Map<string, ProMatch>();

export function loadMatch(id: number | string): ProMatch {
  const key = String(id);
  const cached = cache.get(key);
  if (cached !== undefined) return cached;
  const match = parseProMatch(rawMatch(key));
  cache.set(key, match);
  return match;
}

export function loadIndex(): ProIndex {
  return parseProIndex(readJson('public', 'data', 'pro', 'index.json'));
}

export interface GoldenMatch {
  readonly events: number;
  readonly passes: [number, number];
  readonly accuratePasses: [number, number];
  readonly shots: [number, number];
  readonly shotsOnTarget: [number, number];
  readonly goals: [number, number];
  readonly ownGoalsFor: [number, number];
  readonly corners: [number, number];
  readonly xgUnits: [number, number];
}

export interface Golden {
  readonly matches: number;
  readonly events: number;
  readonly perMatch: Readonly<Record<string, GoldenMatch>>;
  readonly passNetwork: Readonly<
    Record<string, { readonly team: 0 | 1; readonly edges: [string, string, number][] }>
  >;
}

export const golden = readJson('research', 'out', 'pro_golden.json') as Golden;

export const FINAL_2018 = 2058017;
export const FINAL_2016 = 1694440;
