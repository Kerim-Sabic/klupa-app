import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../i18n';
import { env, parseEnv } from '../lib/env';
import { AppErrorBoundary, RouteError, isStaleChunk } from './ErrorScreen';
import { reporter } from './reporter';

const db = vi.hoisted(() => ({ rpc: vi.fn(), getSession: vi.fn() }));

vi.mock('../lib/supabase', () => ({
  supabase: { rpc: db.rpc, auth: { getSession: db.getSession } },
}));

function Broken({ error }: { readonly error: Error }): never {
  throw error;
}

function renderRoute(error: Error, reload: () => void) {
  const router = createMemoryRouter(
    [
      {
        path: '/matches/:matchId',
        element: <Broken error={error} />,
        errorElement: <RouteError reload={reload} />,
      },
    ],
    { initialEntries: ['/matches/3f2b1c9e-8a7d-4e6f-9b0a-1c2d3e4f5a6b'] },
  );
  return render(<RouterProvider router={router} />);
}

beforeEach(async () => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  db.getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
  db.rpc.mockResolvedValue({ error: null });
  await i18n.changeLanguage('en');
  // React logs the error it caught; that noise is expected here.
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('isStaleChunk', () => {
  it('recognises a screen whose code is gone after a release', () => {
    expect(
      isStaleChunk(new TypeError('Failed to fetch dynamically imported module: /assets/x.js')),
    ).toBe(true);
    expect(isStaleChunk(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(isStaleChunk(new TypeError('x is undefined'))).toBe(false);
    expect(isStaleChunk('Failed to fetch dynamically imported module')).toBe(false);
  });
});

describe('RouteError', () => {
  it('explains, offers both ways forward, and files a report without any data', async () => {
    const reload = vi.fn();
    renderRoute(new TypeError('Cannot read player 3f2b1c9e-8a7d-4e6f-9b0a-1c2d3e4f5a6b'), reload);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('This screen stopped working');
    expect(alert).toHaveTextContent('Nothing you recorded is lost');
    expect(screen.getByRole('link', { name: 'Back to Today' })).toHaveAttribute('href', '/');

    await waitFor(() => {
      expect(db.rpc).toHaveBeenCalledTimes(1);
    });
    expect(db.rpc).toHaveBeenCalledWith('report_client_error', {
      error_name: 'TypeError',
      error_message: 'Cannot read player :id',
      // jsdom's address in tests; in the app this is the route with its ids replaced.
      error_route: window.location.pathname,
      // The commit the build stamped in: "local" on a developer machine, a commit id in CI.
      app_release: env.release,
      error_fingerprint: expect.stringMatching(/^[0-9a-f]{8}$/) as string,
    });
    expect(reload).not.toHaveBeenCalled();

    await userEvent.setup().click(screen.getByRole('button', { name: 'Reload' }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('reloads by itself once when a release replaced the files, and says so', async () => {
    const reload = vi.fn();
    const stale = new TypeError('Failed to fetch dynamically imported module: /assets/a.js');
    const first = renderRoute(stale, reload);
    expect(await screen.findByText('Klupa was updated')).toBeInTheDocument();
    expect(reload).toHaveBeenCalledTimes(1);
    first.unmount();

    // The same failure again in this tab is not an update but an outage: no second reload.
    renderRoute(stale, reload);
    await screen.findByText('Klupa was updated');
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does not reload by itself when the tab cannot remember that it did', async () => {
    const reload = vi.fn();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    renderRoute(new TypeError('error loading dynamically imported module'), reload);
    await screen.findByText('Klupa was updated');
    expect(reload).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it('speaks Bosnian', async () => {
    await i18n.changeLanguage('bs');
    renderRoute(new Error('x'), vi.fn());
    expect(await screen.findByText('Ovaj ekran je prestao raditi')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Učitaj ponovo' })).toBeInTheDocument();
  });
});

describe('AppErrorBoundary', () => {
  it('shows its children while nothing is wrong', () => {
    render(
      <AppErrorBoundary>
        <p>All good</p>
      </AppErrorBoundary>,
    );
    expect(screen.getByText('All good')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('replaces a crashed app with the notice, reports it, and reloads on request', async () => {
    const reload = vi.fn();
    render(
      <AppErrorBoundary reload={reload}>
        <Broken error={new RangeError('provider failed')} />
      </AppErrorBoundary>,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('This screen stopped working');
    await waitFor(() => {
      expect(db.rpc).toHaveBeenCalledWith(
        'report_client_error',
        expect.objectContaining({ error_name: 'RangeError', error_message: 'provider failed' }),
      );
    });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Reload' }));
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

describe('the reporter of the app', () => {
  it('stays quiet when nobody is signed in', async () => {
    db.getSession.mockResolvedValue({ data: { session: null } });
    await reporter.report(new Error('signed out'));
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it('swallows a refusal from the database', async () => {
    db.rpc.mockResolvedValue({ error: { code: '42501' } });
    await expect(reporter.report(new Error('refused'))).resolves.toBeUndefined();
  });
});

describe('the release named in a report', () => {
  const base = {
    VITE_SUPABASE_URL: 'https://unit-tests.supabase.co',
    VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_unit_tests_only_000000',
  };

  it('is the commit the build stamped in, or "local" on a developer machine', () => {
    expect(parseEnv({ ...base, VITE_RELEASE: 'abc123def456' }).release).toBe('abc123def456');
    expect(parseEnv(base).release).toBe('local');
  });
});
