import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { Link, MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it } from 'vitest';
import { RouteAnnouncer } from './RouteAnnouncer';

function Late() {
  const [ready, setReady] = useState(false);
  return ready ? (
    <h1>Arrived late</h1>
  ) : (
    <button
      type="button"
      onClick={() => {
        setReady(true);
      }}
    >
      Finish loading
    </button>
  );
}

function App({ at = '/' }: { readonly at?: string }) {
  return (
    <MemoryRouter initialEntries={[at]}>
      <RouteAnnouncer />
      <nav>
        <Link to="/">Home</Link>
        <Link to="/matches">Matches</Link>
        <Link to="/matches?q=fk">Search</Link>
        <Link to="/late">Late</Link>
      </nav>
      <Routes>
        <Route path="/" element={<h1>Today</h1>} />
        <Route path="/matches" element={<h1> Matches{'\n'} and reviews </h1>} />
        <Route path="/late" element={<Late />} />
        <Route
          path="/replay/:match"
          element={
            <main>
              <h1>Replay</h1>
              <Link to="/replay/b">Second match</Link>
            </main>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

function announcer(): HTMLElement {
  const region = document.querySelector<HTMLElement>('[data-route-announcer]');
  if (region === null) throw new Error('The announcer is not on the page.');
  return region;
}

describe('route announcer', () => {
  it('leaves the first page alone: the browser announces a document it loads', () => {
    render(<App />);
    expect(announcer()).toBeEmptyDOMElement();
    expect(document.activeElement).toBe(document.body);
  });

  it('moves focus to the new page heading and says it', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('link', { name: 'Matches' }));
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveFocus();
    // Reachable from script, not a stop in the Tab order.
    expect(heading).toHaveAttribute('tabindex', '-1');
    expect(announcer()).toHaveTextContent('Matches and reviews');
  });

  it('does nothing when only the query changes', async () => {
    render(<App at="/matches" />);
    await userEvent.click(screen.getByRole('link', { name: 'Search' }));
    expect(screen.getByRole('link', { name: 'Search' })).toHaveFocus();
    expect(announcer()).toBeEmptyDOMElement();
  });

  it('leaves focus on a control inside the page that changed the address', async () => {
    render(<App at="/replay/a" />);
    const picker = screen.getByRole('link', { name: 'Second match' });
    await userEvent.click(picker);
    // The same page is still there, and so is the control the coach is using.
    expect(picker).toHaveFocus();
    expect(screen.getByRole('heading', { level: 1 })).not.toHaveAttribute('tabindex');
  });

  it('waits for a page whose heading arrives late', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('link', { name: 'Late' }));
    expect(announcer()).toBeEmptyDOMElement();
    act(() => {
      screen.getByRole('button', { name: 'Finish loading' }).click();
    });
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Arrived late' })).toHaveFocus();
    });
    expect(announcer()).toHaveTextContent('Arrived late');
  });
});
