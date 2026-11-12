import type { RouteObject } from 'react-router';
import { FairnessPage } from './FairnessPage';
import { FairShareView } from './FairShareView';
import { LoadView } from './LoadView';
import { PitchView } from './PitchView';

/**
 * One page, three views, each its own URL so a coach can send a link to one. The pathless parent
 * carries the title and the switcher; the children keep absolute paths like every other feature.
 */
export const insightsRoutes: RouteObject[] = [
  {
    element: <FairnessPage />,
    children: [
      { path: '/fairness', element: <FairShareView /> },
      { path: '/fairness/load', element: <LoadView /> },
      { path: '/fairness/pitch', element: <PitchView /> },
    ],
  },
];
