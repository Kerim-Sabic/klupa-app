import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../src/lib/database';
import { requiredEnv } from './env';

export type TestClient = SupabaseClient<Database>;

export interface TestAccount {
  readonly client: TestClient;
  readonly session: Session;
  readonly userId: string;
}

/**
 * supabase-js keeps the session under `sb-<project ref>-auth-token`, where the ref is the
 * first label of the project's host name (checked against the installed 2.119 source).
 */
export function sessionStorageKey(supabaseUrl: string): string {
  const ref = new URL(supabaseUrl).hostname.split('.')[0] ?? '';
  return `sb-${ref}-auth-token`;
}

/** Sign in from Node with the throwaway account. The password never leaves this function. */
export async function signInTestAccount(): Promise<TestAccount> {
  const client = createClient<Database>(
    requiredEnv('VITE_SUPABASE_URL'),
    requiredEnv('VITE_SUPABASE_PUBLISHABLE_KEY'),
    // Node keeps no session of its own: the browser context owns the refreshing copy.
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data, error } = await client.auth.signInWithPassword({
    email: requiredEnv('KLUPA_IT_EMAIL'),
    password: requiredEnv('KLUPA_IT_PASSWORD'),
  });
  if (error !== null) throw new Error(`Test account sign-in failed: ${error.message}`);
  return { client, session: data.session, userId: data.user.id };
}

/** Every club the account belongs to, deleted the way the app deletes one. Returns the count. */
export async function deleteAllClubs(account: TestAccount): Promise<number> {
  const { data, error } = await account.client
    .from('club_members')
    .select('club_id')
    .eq('user_id', account.userId)
    .limit(50);
  if (error !== null) throw new Error(`Listing clubs failed: ${error.message}`);
  for (const row of data) {
    const removed = await account.client.rpc('delete_club', { target_club: row.club_id });
    if (removed.error !== null) throw new Error(`Deleting a club failed: ${removed.error.message}`);
  }
  return data.length;
}

/**
 * The script that puts the session in place before the app's own code runs. It only writes
 * when nothing is stored, so a reload never overwrites a session the app has since refreshed.
 */
export function injectSessionScript(key: string, session: Session): string {
  const storageKey = JSON.stringify(key);
  const value = JSON.stringify(JSON.stringify(session));
  return `if (window.localStorage.getItem(${storageKey}) === null) window.localStorage.setItem(${storageKey}, ${value});`;
}
