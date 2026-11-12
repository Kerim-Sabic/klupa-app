import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionConfig, MotionGlobalConfig } from 'motion/react';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { vi } from 'vitest';
import '../i18n';
import { readJson } from './proFixtures';

MotionGlobalConfig.skipAnimations = true;

/** Serve the shipped files from disk through a mocked fetch; ids in `fail` answer 500. */
export function serveProData(options: { readonly fail?: readonly string[] } = {}) {
  const fetchMock = vi.fn((url: string) => {
    const name = /data\/pro\/(\w+)\.json$/.exec(url)?.[1];
    if (name === undefined) return Promise.resolve(new Response(null, { status: 404 }));
    if (options.fail?.includes(name) === true) {
      return Promise.resolve(new Response(null, { status: 500 }));
    }
    try {
      const body = JSON.stringify(readJson('public', 'data', 'pro', `${name}.json`));
      return Promise.resolve(new Response(body, { status: 200 }));
    } catch {
      return Promise.resolve(new Response(null, { status: 404 }));
    }
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** Render a page at a path with the providers the app root gives it, and no query retries. */
export function renderPage(path: string, routes: readonly [string, ReactElement][]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const user = userEvent.setup();
  const view = render(
    <QueryClientProvider client={client}>
      <MotionConfig reducedMotion="user">
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            {routes.map(([pattern, element]) => (
              <Route key={pattern} path={pattern} element={element} />
            ))}
          </Routes>
        </MemoryRouter>
      </MotionConfig>
    </QueryClientProvider>,
  );
  return { user, client, ...view };
}
