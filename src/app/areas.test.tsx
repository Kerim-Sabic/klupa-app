import type { RouteObject } from 'react-router';
import { describe, expect, it } from 'vitest';
import { relativeRoutes } from './areas';

describe('relativeRoutes', () => {
  it('rewrites absolute feature paths relative to their area', () => {
    const routes: RouteObject[] = [
      { path: '/matches', element: null },
      { path: '/matches/:matchId/live', element: null },
      { path: '/matches/:matchId', element: null },
    ];
    expect(relativeRoutes('/matches', routes)).toEqual([
      { index: true, element: null },
      { path: ':matchId/live', element: null },
      { path: ':matchId', element: null },
    ]);
  });

  it('keeps pathless layout routes and rewrites their children', () => {
    const routes: RouteObject[] = [
      {
        element: null,
        children: [
          { path: '/fairness', element: null },
          { path: '/fairness/load', element: null },
          { index: true, element: null },
        ],
      },
    ];
    expect(relativeRoutes('/fairness', routes)).toEqual([
      {
        element: null,
        children: [
          { index: true, element: null },
          { path: 'load', element: null },
          { index: true, element: null },
        ],
      },
    ]);
  });

  it('keeps the path when the area root has children of its own', () => {
    const routes: RouteObject[] = [
      { path: '/club', element: null, children: [{ path: '/club/squad', element: null }] },
    ];
    expect(relativeRoutes('/club', routes)).toEqual([
      { path: '', element: null, children: [{ path: 'squad', element: null }] },
    ]);
  });

  it('refuses a route that belongs to another area', () => {
    expect(() => relativeRoutes('/club', [{ path: '/clubhouse', element: null }])).toThrow(
      /does not belong/,
    );
    expect(() => relativeRoutes('/club', [{ path: '/matches', element: null }])).toThrow(
      /does not belong/,
    );
  });
});
