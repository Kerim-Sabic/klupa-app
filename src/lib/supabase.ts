import { createClient } from '@supabase/supabase-js';
import type { Database } from './database';
import { env } from './env';

/**
 * The one Supabase client. Every query and the session itself go through it,
 * so there is a single source of truth for who is signed in. It only ever
 * holds the publishable key; row-level security in the database is the boundary.
 */
export const supabase = createClient<Database>(env.supabaseUrl, env.supabaseKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

export type Tables = Database['public']['Tables'];
export type Enums = Database['public']['Enums'];
export type Row<Name extends keyof Tables> = Tables[Name]['Row'];
