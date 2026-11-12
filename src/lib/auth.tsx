import type { User } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from './supabase';

export type AuthState =
  | { readonly status: 'loading' }
  | { readonly status: 'signed-out' }
  | { readonly status: 'signed-in'; readonly user: User };

export interface AuthContextValue {
  readonly state: AuthState;
  /** Email a one-time code. No password is ever created or stored. */
  readonly requestCode: (email: string) => Promise<void>;
  readonly verifyCode: (email: string, code: string) => Promise<void>;
  /** A throwaway account for trying the app; its club is purged after a week. */
  readonly startDemo: () => Promise<void>;
  readonly signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * The single source of truth for the session. It mirrors what the Supabase
 * client reports and nothing else; no component keeps its own copy of the user.
 */
export function AuthProvider({ children }: { readonly children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  useEffect(() => {
    // Fires once with the stored session, then on every sign-in, refresh and sign-out.
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setState(
        session === null ? { status: 'signed-out' } : { status: 'signed-in', user: session.user },
      );
    });
    return () => {
      data.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      requestCode: async (email) => {
        const { error } = await supabase.auth.signInWithOtp({
          email: email.trim().toLowerCase(),
          options: { shouldCreateUser: true, emailRedirectTo: window.location.origin },
        });
        if (error !== null) throw error;
      },
      verifyCode: async (email, code) => {
        const { error } = await supabase.auth.verifyOtp({
          email: email.trim().toLowerCase(),
          token: code.trim(),
          type: 'email',
        });
        if (error !== null) throw error;
      },
      startDemo: async () => {
        const { error } = await supabase.auth.signInAnonymously();
        if (error !== null) throw error;
      },
      signOut: async () => {
        const { error } = await supabase.auth.signOut();
        if (error !== null) throw error;
      },
    }),
    [state],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (value === null) throw new Error('useAuth must be used inside <AuthProvider>.');
  return value;
}
