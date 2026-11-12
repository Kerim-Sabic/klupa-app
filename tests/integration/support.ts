import { deleteClub } from '../../src/features/club/privacy/api';
import type { SeasonData } from '../../src/features/club/seed';
import type { ActiveClub } from '../../src/lib/club';
import type { Player } from '../../src/lib/data';
import { supabase, type Tables } from '../../src/lib/supabase';

/** The test account, read from the environment. Never printed, never stored anywhere. */
export const IT_EMAIL = process.env['KLUPA_IT_EMAIL'];
const IT_PASSWORD = process.env['KLUPA_IT_PASSWORD'];

/** State handed from one ordered step to the next. Each step names what it needs with `need`. */
export interface Scenario {
  userId?: string;
  club?: ActiveClub;
  season?: SeasonData;
  today?: string;
  players?: Player[];
  /** A match created during the run (the seeded ones are read-only evidence). */
  liveMatchId?: string;
  session?: { id: string; minutes: number; focus: string };
}

export function need<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) {
    throw new Error(`An earlier step should have provided ${what}.`);
  }
  return value;
}

export async function signIn(): Promise<string> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: need(IT_EMAIL, 'KLUPA_IT_EMAIL'),
    password: need(IT_PASSWORD, 'KLUPA_IT_PASSWORD'),
  });
  if (error !== null) throw new Error(`Sign-in failed: ${error.message}`);
  return data.user.id;
}

/** Every club the user belongs to, deleted through the app's own function. */
export async function removeAllClubs(userId: string): Promise<number> {
  const { data, error } = await supabase
    .from('club_members')
    .select('club_id')
    .eq('user_id', userId)
    .limit(50);
  if (error !== null) throw error;
  for (const row of data) await deleteClub(row.club_id);
  return data.length;
}

export type CountedTable = {
  [Name in keyof Tables]: 'club_id' extends keyof Tables[Name]['Row'] ? Name : never;
}[keyof Tables];

export async function countRows(table: CountedTable, clubId: string): Promise<number> {
  const { count, error } = await supabase
    .from(table)
    .select('*', { count: 'exact', head: true })
    .eq('club_id', clubId);
  if (error !== null) throw error;
  return count ?? 0;
}

export function sum<T>(items: readonly T[], pick: (item: T) => number): number {
  return items.reduce((total, item) => total + pick(item), 0);
}
