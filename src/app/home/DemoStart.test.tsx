import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import { DemoStart } from './SetupSection';

interface SampleLoad {
  mutate: () => void;
  isPending: boolean;
  isError: boolean;
  error: unknown;
}

const state = vi.hoisted((): { sample: SampleLoad } => ({
  sample: { mutate: () => undefined, isPending: false, isError: false, error: null },
}));

vi.mock('../../features/club/useSampleSeason', () => ({
  useSampleSeason: () => state.sample,
}));

function Address() {
  const { search } = useLocation();
  return <p data-testid="search">{search}</p>;
}

function show(at = '/') {
  return render(
    <MemoryRouter initialEntries={[at]}>
      <DemoStart />
      <Address />
    </MemoryRouter>,
  );
}

function load(overrides: Partial<SampleLoad> = {}): SampleLoad {
  const sample = { mutate: vi.fn(), isPending: false, isError: false, error: null, ...overrides };
  state.sample = sample;
  return sample;
}

beforeEach(async () => {
  await i18n.changeLanguage('en');
});

describe('an empty demo club on Today', () => {
  it('waits for a tap when the visitor simply opens Today', async () => {
    const sample = load();
    show();
    expect(screen.getByRole('heading', { name: 'Your demo club is empty' })).toBeInTheDocument();
    expect(sample.mutate).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Load the sample season' }));
    expect(sample.mutate).toHaveBeenCalledOnce();
  });

  it('loads the season by itself, once, for a visitor who has just made a demo club', async () => {
    const sample = load();
    const view = show('/?sample=1');
    await waitFor(() => {
      expect(sample.mutate).toHaveBeenCalledOnce();
    });
    // The request is used up: the address is clean again, so a reload does not ask twice.
    expect(screen.getByTestId('search')).toHaveTextContent('');
    view.rerender(
      <MemoryRouter initialEntries={['/']}>
        <DemoStart />
        <Address />
      </MemoryRouter>,
    );
    expect(sample.mutate).toHaveBeenCalledOnce();
  });

  it('says so while the season is being written', () => {
    load({ isPending: true });
    show();
    expect(screen.getByRole('status')).toHaveTextContent(/Adding the squad/);
    expect(
      screen.queryByRole('button', { name: 'Load the sample season' }),
    ).not.toBeInTheDocument();
  });

  it('explains a failure and offers another try', async () => {
    const sample = load({ isError: true, error: { code: '54000' } });
    show();
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('The sample season could not be loaded');
    await userEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(sample.mutate).toHaveBeenCalledOnce();
  });

  it('is written in Bosnian too', async () => {
    load();
    await i18n.changeLanguage('bs');
    show();
    expect(screen.getByRole('button', { name: /sezon/i })).toBeInTheDocument();
  });
});
