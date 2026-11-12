import type { RouteObject } from 'react-router';
import { MatchReviewPage } from '../momentum/MatchReviewPage';
import { MatchesPage } from './MatchesPage';
import { TaggerPage } from './TaggerPage';

/** List, live tagger and review. The review screen belongs to the momentum feature. */
export const matchesRoutes: RouteObject[] = [
  { path: '/matches', element: <MatchesPage /> },
  { path: '/matches/:matchId/live', element: <TaggerPage /> },
  { path: '/matches/:matchId', element: <MatchReviewPage /> },
];
