import { createBrowserRouter, Outlet, ScrollRestoration, type RouteObject } from 'react-router';
import { AppShell } from './AppShell';
import { area, PageSpinner } from './areas';
import { RouteError } from './ErrorScreen';
import { RequireAuth, RequireClub } from './guards';
import { HomePage } from './HomePage';
import { NotFoundPage } from './pages';
import { SignInPage } from './SignInPage';
import { RouteAnnouncer } from './RouteAnnouncer';
import { useDocumentTitle } from './useDocumentTitle';
import { WelcomePage } from './WelcomePage';

/**
 * Route table. Public pages first; everything else sits behind a session, and
 * every feature screen also sits behind an active club. Each feature owns its
 * own routes file and is downloaded on first use, so features can be built,
 * reviewed and shipped independently and the first screen stays small.
 */
const pages: RouteObject[] = [
  { path: '/sign-in', element: <SignInPage /> },
  {
    path: '/evidence',
    hydrateFallbackElement: <PageSpinner />,
    lazy: async () => ({ Component: (await import('./EvidencePage')).EvidencePage }),
  },
  {
    path: '/movement',
    hydrateFallbackElement: <PageSpinner />,
    lazy: async () => ({
      Component: (await import('../features/movement/MovementLabPage')).MovementLabPage,
    }),
  },
  {
    path: '/movement/:matchId',
    hydrateFallbackElement: <PageSpinner />,
    lazy: async () => ({
      Component: (await import('../features/movement/MovementLabPage')).MovementLabPage,
    }),
  },
  {
    path: '/pro',
    hydrateFallbackElement: <PageSpinner />,
    lazy: async () => ({
      Component: (await import('../features/pro/ProListPage')).ProListPage,
    }),
  },
  {
    path: '/pro/:matchId',
    hydrateFallbackElement: <PageSpinner />,
    lazy: async () => ({
      Component: (await import('../features/pro/ProMatchPage')).ProMatchPage,
    }),
  },
  {
    path: '/shot',
    hydrateFallbackElement: <PageSpinner />,
    lazy: async () => ({
      Component: (await import('../features/shotlab/ShotLabPage')).ShotLabPage,
    }),
  },
  {
    path: '/overlay',
    hydrateFallbackElement: <PageSpinner />,
    lazy: async () => ({
      Component: (await import('../features/overlay/OverlayPage')).OverlayPage,
    }),
  },
  {
    path: '/status',
    hydrateFallbackElement: <PageSpinner />,
    lazy: async () => ({ Component: (await import('./status/StatusPage')).StatusPage }),
  },
  {
    element: <RequireAuth />,
    children: [
      { path: '/welcome', element: <WelcomePage /> },
      {
        element: <RequireClub />,
        children: [
          {
            element: <AppShell />,
            children: [
              { index: true, element: <HomePage />, errorElement: <RouteError /> },
              area(
                '/matches',
                async () => (await import('../features/matches/routes')).matchesRoutes,
              ),
              area(
                '/training',
                async () => (await import('../features/sessions/routes')).sessionsRoutes,
              ),
              area(
                '/fairness',
                async () => (await import('../features/insights/routes')).insightsRoutes,
              ),
              area('/club', async () => (await import('../features/club/routes')).clubRoutes),
            ],
          },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
];

/**
 * A new page opens at its top; going back returns to where the coach was. Without this the
 * browser keeps the old scroll offset, and a link tapped low on one page opens the next one
 * halfway down.
 */
function Root() {
  useDocumentTitle();
  return (
    <>
      <ScrollRestoration />
      <RouteAnnouncer />
      <Outlet />
    </>
  );
}

/** Every page sits under one route, which also catches what nothing nearer caught. */
export const routes: RouteObject[] = [
  { element: <Root />, errorElement: <RouteError />, children: pages },
];

export const router = createBrowserRouter(routes);
