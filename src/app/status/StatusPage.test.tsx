import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import { StatusPage } from './StatusPage';
import { fetchStatus, parseStatus, rate, speedOf } from './statusModel';

const HEALTHY = {
  status: 'ok',
  commit: 'abc1234def5678',
  requestId: 'req-1',
  checkedAt: '2026-11-12T03:00:00.000Z',
  checks: { database: { ok: true, ms: 42 }, auth: { ok: true, ms: 31 } },
  field: {
    errors1h: 2,
    errors24h: 9,
    errorKinds24h: 3,
    pages7d: { samples: 1400, lcpP75Ms: 1840, inpP75Ms: 240, clsP75: 0.31 },
  },
};

function answer(body: unknown, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), { status }))),
  );
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <StatusPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(async () => {
  await i18n.changeLanguage('en');
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('StatusPage', () => {
  it('says everything is answering, with each service and how long it took', async () => {
    answer(HEALTHY);
    renderPage();
    expect(await screen.findByText('Everything is answering')).toBeInTheDocument();
    const services = within(screen.getByRole('region', { name: 'Services' }));
    expect(services.getByText('answered in 42 ms')).toBeInTheDocument();
    expect(services.getAllByText('Up')).toHaveLength(2);
    expect(screen.getByText(/Release abc1234, checked/)).toBeInTheDocument();
  });

  it('shows the errors people hit and rates the page speed of the week', async () => {
    answer(HEALTHY);
    renderPage();
    const errors = within(await screen.findByRole('region', { name: 'Errors people hit' }));
    expect(errors.getByText('2')).toBeInTheDocument();
    expect(errors.getByText('9')).toBeInTheDocument();
    expect(errors.getByText('different errors: 3')).toBeInTheDocument();
    const speed = within(screen.getByRole('region', { name: 'Page speed this week' }));
    expect(speed.getByText('1.8 s')).toBeInTheDocument();
    expect(speed.getByText('Good')).toBeInTheDocument();
    expect(speed.getByText('240 ms')).toBeInTheDocument();
    expect(speed.getByText('Needs work')).toBeInTheDocument();
    expect(speed.getByText('0.31')).toBeInTheDocument();
    expect(speed.getByText('Poor')).toBeInTheDocument();
    expect(speed.getByText(/Measured page loads: 1,400/)).toBeInTheDocument();
  });

  it('reads a 503 as the service saying it is degraded, and names the service', async () => {
    answer(
      {
        ...HEALTHY,
        status: 'degraded',
        commit: null,
        checks: {
          database: { ok: false, ms: 3000, failure: 'timeout' },
          auth: { ok: true, ms: 20 },
        },
        field: null,
      },
      503,
    );
    renderPage();
    expect(await screen.findByText('Something is not answering')).toBeInTheDocument();
    const services = within(screen.getByRole('region', { name: 'Services' }));
    expect(services.getByText('timed out')).toBeInTheDocument();
    expect(services.getByText('Down')).toBeInTheDocument();
    expect(
      screen.getByText('The error and page-speed numbers are not available right now.'),
    ).toBeInTheDocument();
    expect(screen.getByText(/Release unknown/)).toBeInTheDocument();
  });

  it('says so before any page load has been measured, in Bosnian too', async () => {
    await i18n.changeLanguage('bs');
    answer({
      ...HEALTHY,
      field: {
        errors1h: 0,
        errors24h: 0,
        errorKinds24h: 0,
        pages7d: { samples: 0, lcpP75Ms: null, inpP75Ms: null, clsP75: null },
      },
    });
    renderPage();
    expect(await screen.findByText('Sve radi')).toBeInTheDocument();
    expect(screen.getByText('Još nijedno učitavanje stranice nije izmjereno.')).toBeInTheDocument();
  });

  it('leaves out a number no browser has reported yet', async () => {
    answer({
      ...HEALTHY,
      field: {
        ...HEALTHY.field,
        pages7d: { samples: 3, lcpP75Ms: 900, inpP75Ms: null, clsP75: 0 },
      },
    });
    renderPage();
    const speed = within(await screen.findByRole('region', { name: 'Page speed this week' }));
    expect(speed.getByText('not measured yet')).toBeInTheDocument();
    expect(speed.getAllByText('Good')).toHaveLength(2);
  });

  it('offers a retry when the endpoint cannot be read', async () => {
    answer('<html>not json</html>');
    renderPage();
    expect(await screen.findByText('The status could not be read')).toBeInTheDocument();
    answer(HEALTHY);
    await userEvent.click(screen.getByRole('button', { name: /again/i }));
    expect(await screen.findByText('Everything is answering')).toBeInTheDocument();
  });
});

describe('statusModel', () => {
  it('accepts an answer from a function that has no pulse yet', () => {
    const { field: _field, ...older } = HEALTHY;
    expect(parseStatus(older).field).toBeUndefined();
  });

  it('refuses anything that is not a health answer', () => {
    expect(() => parseStatus({ status: 'fine' })).toThrow(/something else/);
    expect(() => parseStatus(null)).toThrow();
  });

  it('asks the endpoint through the given fetch', async () => {
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response(JSON.stringify(HEALTHY))),
    );
    expect((await fetchStatus(fetchImpl)).status).toBe('ok');
    expect(fetchImpl).toHaveBeenCalledWith('/api/health', expect.anything());
  });

  it('rates on the usual thresholds, inclusive at the boundary', () => {
    expect(rate('lcp', 2500)).toBe('good');
    expect(rate('lcp', 2501)).toBe('fair');
    expect(rate('lcp', 4001)).toBe('poor');
    expect(rate('inp', 200)).toBe('good');
    expect(rate('inp', 500)).toBe('fair');
    expect(rate('cls', 0.1)).toBe('good');
    expect(rate('cls', 0.26)).toBe('poor');
    expect(speedOf(HEALTHY.field.pages7d)).toEqual({ lcp: 1840, inp: 240, cls: 0.31 });
  });
});
