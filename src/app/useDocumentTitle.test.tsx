import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { createMemoryRouter, Link, Outlet, RouterProvider, type RouteObject } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_NAME, titleFor, useDocumentTitle } from './useDocumentTitle';

describe('titleFor', () => {
  it('puts the heading before the name of the app', () => {
    expect(titleFor('Matches')).toBe('Matches · Klupa');
  });

  it('is the name of the app alone when there is no heading or an empty one', () => {
    expect(titleFor(null)).toBe(APP_NAME);
    expect(titleFor('')).toBe(APP_NAME);
    expect(titleFor(' \n\t ')).toBe(APP_NAME);
  });

  it('does not say the name twice when the heading is the name', () => {
    expect(titleFor('Klupa')).toBe('Klupa');
    expect(titleFor('  Klupa ')).toBe('Klupa');
  });

  it('reads a heading broken over lines or elements as one line', () => {
    expect(titleFor('  Sloga\n   3 : 1   Mladost ')).toBe('Sloga 3 : 1 Mladost · Klupa');
  });
});

/** The app's root in small: the hook once, above every page. */
function Root() {
  useDocumentTitle();
  return (
    <>
      <nav>
        <Link to="/matches">to matches</Link>
        <Link to="/training">to training</Link>
        <Link to="/bare">to bare</Link>
        <Link to="/match/7">to match</Link>
      </nav>
      <Outlet />
    </>
  );
}

/** A page whose heading comes with its data, and is then rewritten in place. */
function MatchPage() {
  const [name, setName] = useState<string | null>(null);
  return (
    <main>
      {name === null ? <p>Loading</p> : <h1>{name}</h1>}
      <button
        type="button"
        onClick={() => {
          setName((before) => (before === null ? 'Sloga v Mladost' : 'Sloga protiv Mladosti'));
        }}
      >
        next
      </button>
    </main>
  );
}

const pages: RouteObject[] = [
  {
    element: <Root />,
    children: [
      { path: '/matches', element: <h1>Matches</h1> },
      {
        // Downloaded on first use, like every feature route of the app.
        path: '/training',
        lazy: async () => {
          await Promise.resolve();
          return { Component: () => <h1>Training</h1> };
        },
      },
      { path: '/bare', element: <p>No heading here</p> },
      { path: '/match/:matchId', element: <MatchPage /> },
    ],
  },
];

function open(path: string) {
  const router = createMemoryRouter(pages, { initialEntries: [path] });
  return render(<RouterProvider router={router} />);
}

describe('useDocumentTitle', () => {
  beforeEach(() => {
    document.title = 'Klupa';
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('titles the page from its heading as soon as it is on screen', () => {
    open('/matches');
    expect(document.title).toBe('Matches · Klupa');
  });

  it('follows a route change, including to a page whose code arrives later', async () => {
    const user = userEvent.setup();
    open('/matches');
    await user.click(screen.getByRole('link', { name: 'to training' }));
    await waitFor(() => {
      expect(document.title).toBe('Training · Klupa');
    });
    await user.click(screen.getByRole('link', { name: 'to matches' }));
    await waitFor(() => {
      expect(document.title).toBe('Matches · Klupa');
    });
  });

  it('falls back to the name of the app on a page without a heading', async () => {
    const user = userEvent.setup();
    open('/matches');
    await user.click(screen.getByRole('link', { name: 'to bare' }));
    await waitFor(() => {
      expect(document.title).toBe('Klupa');
    });
  });

  it('waits for a heading that comes with the data, then follows it when it is reworded', async () => {
    const user = userEvent.setup();
    open('/match/7');
    expect(document.title).toBe('Klupa');
    await user.click(screen.getByRole('button', { name: 'next' }));
    await waitFor(() => {
      expect(document.title).toBe('Sloga v Mladost · Klupa');
    });
    // The same element, new words: what a language switch does.
    await user.click(screen.getByRole('button', { name: 'next' }));
    await waitFor(() => {
      expect(document.title).toBe('Sloga protiv Mladosti · Klupa');
    });
  });

  it('does not write the title again while the heading stays the same', async () => {
    const user = userEvent.setup();
    const written = vi.spyOn(document, 'title', 'set');
    open('/match/7');
    await user.click(screen.getByRole('button', { name: 'next' }));
    await waitFor(() => {
      expect(written).toHaveBeenLastCalledWith('Sloga v Mladost · Klupa');
    });
    const writes = written.mock.calls.length;
    // Something else on the page changes; the heading does not.
    const other = document.createElement('aside');
    document.body.append(other);
    await Promise.resolve();
    expect(written.mock.calls.length).toBe(writes);
    other.remove();
  });

  it('stops watching when it is taken off the page', async () => {
    const disconnect = vi.spyOn(MutationObserver.prototype, 'disconnect');
    const { unmount } = open('/matches');
    unmount();
    expect(disconnect).toHaveBeenCalledTimes(1);
    const late = document.createElement('h1');
    late.textContent = 'Too late';
    document.body.append(late);
    await Promise.resolve();
    expect(document.title).toBe('Matches · Klupa');
    late.remove();
  });
});
