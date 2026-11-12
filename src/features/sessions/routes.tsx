import type { RouteObject } from 'react-router';
import { PlannerPage } from './PlannerPage';
import { SessionPage } from './SessionPage';
import { SessionsPage } from './SessionsPage';

/** Training: the list, the planner, and one session with its attendance. `new` outranks `:sessionId`. */
export const sessionsRoutes: RouteObject[] = [
  { path: '/training', element: <SessionsPage /> },
  { path: '/training/new', element: <PlannerPage /> },
  { path: '/training/:sessionId', element: <SessionPage /> },
];
