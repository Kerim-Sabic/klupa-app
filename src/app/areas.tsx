import { Compass } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  useRoutes,
  type IndexRouteObject,
  type NonIndexRouteObject,
  type RouteObject,
} from 'react-router';
import { EmptyState, LinkButton, Spinner } from '../ui';
import { RouteError } from './ErrorScreen';

/**
 * Features declare absolute paths (`/matches/:matchId`). An area is mounted at
 * `/matches/*`, so its routes are rewritten relative to that prefix. A route
 * outside the prefix is a programming error and fails loudly.
 */
export function relativeRoutes(prefix: string, routes: readonly RouteObject[]): RouteObject[] {
  return routes.map((route): RouteObject => {
    if (route.index === true) return route;
    const children =
      route.children === undefined ? undefined : relativeRoutes(prefix, route.children);
    const withChildren = children === undefined ? {} : { children };
    if (route.path === undefined) return { ...route, ...withChildren };
    if (route.path !== prefix && !route.path.startsWith(`${prefix}/`)) {
      throw new Error(`Route "${route.path}" does not belong to the "${prefix}" area.`);
    }
    const rest = route.path.slice(prefix.length + 1);
    if (rest === '' && children === undefined) return toIndex(route);
    return { ...route, path: rest, ...withChildren };
  });
}

function toIndex(route: NonIndexRouteObject): IndexRouteObject {
  const { path, children, index, ...shared } = route;
  return { ...shared, index: true };
}

function AreaNotFound() {
  const { t } = useTranslation();
  return (
    <EmptyState
      icon={<Compass aria-hidden="true" />}
      title={t('notFound.title')}
      body={t('notFound.body')}
      action={<LinkButton to="/">{t('notFound.back')}</LinkButton>}
    />
  );
}

function Area({ routes }: { readonly routes: RouteObject[] }) {
  return useRoutes(routes);
}

/** Shown while a section's code is still downloading on a first, direct visit. */
export function PageSpinner() {
  return (
    <div className="grid min-h-[40dvh] place-items-center">
      <Spinner />
    </div>
  );
}

/**
 * One section of the app, downloaded only when the coach first opens it, so
 * the sign-in screen does not pay for the tagger, the planner or the charts.
 */
export function area(prefix: string, load: () => Promise<RouteObject[]>): RouteObject {
  return {
    path: `${prefix}/*`,
    hydrateFallbackElement: <PageSpinner />,
    // A section that fails keeps the tab bar on screen, so the coach can go elsewhere.
    errorElement: <RouteError />,
    lazy: async () => {
      const routes = [
        ...relativeRoutes(prefix, await load()),
        { path: '*', element: <AreaNotFound /> },
      ];
      return { element: <Area routes={routes} /> };
    },
  };
}
