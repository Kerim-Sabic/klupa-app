import type { Session } from '@supabase/supabase-js';
import { act, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth, type AuthContextValue } from './auth';

type Listener = (event: string, session: Session | null) => void;

const auth = vi.hoisted(() => ({
  listener: null as Listener | null,
  unsubscribe: vi.fn(),
  signInWithOtp: vi.fn(),
  verifyOtp: vi.fn(),
  signInAnonymously: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('./supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: (listener: Listener) => {
        auth.listener = listener;
        return { data: { subscription: { unsubscribe: auth.unsubscribe } } };
      },
      signInWithOtp: auth.signInWithOtp,
      verifyOtp: auth.verifyOtp,
      signInAnonymously: auth.signInAnonymously,
      signOut: auth.signOut,
    },
  },
}));

const captured: { value: AuthContextValue | null } = { value: null };
function Probe() {
  const value = useAuth();
  useEffect(() => {
    captured.value = value;
  });
  return <p>{value.state.status}</p>;
}

function api(): AuthContextValue {
  if (captured.value === null) throw new Error('AuthProvider has not rendered yet.');
  return captured.value;
}

function emit(session: Session | null): void {
  act(() => {
    auth.listener?.('SIGNED_IN', session);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const call of [auth.signInWithOtp, auth.verifyOtp, auth.signInAnonymously, auth.signOut]) {
    call.mockResolvedValue({ error: null });
  }
});

describe('AuthProvider', () => {
  it('mirrors the session the client reports and stops listening on unmount', () => {
    const view = render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    expect(screen.getByText('loading')).toBeInTheDocument();
    emit(null);
    expect(screen.getByText('signed-out')).toBeInTheDocument();
    emit({ user: { id: 'user-1' } } as Session);
    expect(screen.getByText('signed-in')).toBeInTheDocument();
    expect(api().state).toMatchObject({ user: { id: 'user-1' } });
    view.unmount();
    expect(auth.unsubscribe).toHaveBeenCalledOnce();
  });

  it('requests and verifies a one-time code with a normalised email', async () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await api().requestCode('  Coach@Example.COM ');
    expect(auth.signInWithOtp).toHaveBeenCalledWith({
      email: 'coach@example.com',
      options: { shouldCreateUser: true, emailRedirectTo: window.location.origin },
    });
    await api().verifyCode('Coach@Example.com', ' 123456 ');
    expect(auth.verifyOtp).toHaveBeenCalledWith({
      email: 'coach@example.com',
      token: '123456',
      type: 'email',
    });
  });

  it('starts a demo session and signs out', async () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await api().startDemo();
    await api().signOut();
    expect(auth.signInAnonymously).toHaveBeenCalledOnce();
    expect(auth.signOut).toHaveBeenCalledOnce();
  });

  it('throws the provider error instead of failing silently', async () => {
    const failure = { code: 'over_email_send_rate_limit' };
    for (const call of [auth.signInWithOtp, auth.verifyOtp, auth.signInAnonymously, auth.signOut]) {
      call.mockResolvedValue({ error: failure });
    }
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await expect(api().requestCode('a@b.co')).rejects.toBe(failure);
    await expect(api().verifyCode('a@b.co', '123456')).rejects.toBe(failure);
    await expect(api().startDemo()).rejects.toBe(failure);
    await expect(api().signOut()).rejects.toBe(failure);
  });

  it('refuses to be used outside its provider', () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<Probe />)).toThrow(/inside <AuthProvider>/);
    quiet.mockRestore();
  });
});
