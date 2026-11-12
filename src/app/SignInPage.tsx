import { lazy, Suspense } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../lib/auth';
import { Card } from '../ui';
import { Hero } from './landing/Hero';
import { SignInCard } from './landing/SignInCard';
import { useRun } from './landing/useRun';
import { PublicLayout } from './PublicLayout';

/* Everything under the headline (the live match centre, the film, the tiles) brings the
   reading engine and the research figures with it: fetched once the headline and the sign-in
   form are up, with space held so the form does not jump far. */
const Below = lazy(() => import('./landing/Below'));

/**
 * The front door. A visitor reads what Klupa is, sees the product itself, can open a throwaway
 * demo club in one tap, can walk into every public screen, or can sign in with an emailed
 * one-time code. No passwords.
 */
export function SignInPage() {
  const { state, startDemo } = useAuth();
  const { busy, run } = useRun();

  if (state.status === 'signed-in') return <Navigate to="/" replace />;

  return (
    <PublicLayout wide>
      <div className="flex flex-col gap-5">
        <Hero
          demoBusy={busy === 'demo'}
          onDemo={() => {
            void run('demo', startDemo);
          }}
        />
        <Suspense fallback={<Card className="min-h-[44rem] lg:min-h-[40rem]" />}>
          <Below />
        </Suspense>
        <div className="mx-auto w-full max-w-md pt-8">
          <SignInCard busy={busy} run={run} />
        </div>
      </div>
    </PublicLayout>
  );
}
