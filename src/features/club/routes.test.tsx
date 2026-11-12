import { describe, expect, it } from 'vitest';
import { clubRoutes } from './routes';

describe('clubRoutes', () => {
  it('has an absolute path for each page of the club', () => {
    expect(clubRoutes.map((route) => route.path)).toEqual([
      '/club',
      '/club/squad',
      '/club/settings',
      '/club/privacy',
      '/club/activity',
    ]);
    for (const route of clubRoutes) expect(route.element).toBeDefined();
  });
});
