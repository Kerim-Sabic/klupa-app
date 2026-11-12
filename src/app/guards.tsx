import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, Outlet } from 'react-router';
import { useAuth } from '../lib/auth';
import { ClubProvider, useClub } from '../lib/club';
import { ErrorNotice, Spinner } from '../ui';

function FullPage({ children }: { readonly children: ReactNode }) {
  return <div className="grid min-h-dvh place-items-center p-6">{children}</div>;
}

/** Everything below this needs a session. The session comes from one place: useAuth. */
export function RequireAuth() {
  const { state } = useAuth();
  if (state.status === 'loading') {
    return (
      <FullPage>
        <Spinner />
      </FullPage>
    );
  }
  if (state.status === 'signed-out') return <Navigate to="/sign-in" replace />;
  return (
    <ClubProvider>
      <Outlet />
    </ClubProvider>
  );
}

/** Everything below this needs a club and a team; otherwise the coach is sent to set one up. */
export function RequireClub() {
  const { t } = useTranslation();
  const { state, refresh } = useClub();
  if (state.status === 'loading') {
    return (
      <FullPage>
        <Spinner />
      </FullPage>
    );
  }
  if (state.status === 'error') {
    return (
      <FullPage>
        <ErrorNotice
          title={t('errors.loadFailed')}
          body={t('errors.offline')}
          onRetry={() => {
            void refresh();
          }}
        />
      </FullPage>
    );
  }
  if (state.status === 'none') return <Navigate to="/welcome" replace />;
  return <Outlet />;
}
