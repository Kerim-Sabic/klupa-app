import type { RouteObject } from 'react-router';
import { ActivityPage } from './ActivityPage';
import { ClubPage } from './ClubPage';
import { PrivacyPage } from './PrivacyPage';
import { SettingsPage } from './SettingsPage';
import { SquadPage } from './SquadPage';

export const clubRoutes: RouteObject[] = [
  { path: '/club', element: <ClubPage /> },
  { path: '/club/squad', element: <SquadPage /> },
  { path: '/club/settings', element: <SettingsPage /> },
  { path: '/club/privacy', element: <PrivacyPage /> },
  { path: '/club/activity', element: <ActivityPage /> },
];
