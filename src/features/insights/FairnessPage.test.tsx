import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setLanguage } from '../../ui/testUtils';
import { viewForPath } from './FairnessPage';
import { insightsRoutes } from './routes';
import { player, renderInsights, seed, stint } from './testKit';

vi.mock('./api');
vi.mock('../../lib/club', () => ({
  useActiveClub: () => ({ clubId: 'club-1', teamId: 'team-1' }),
}));
vi.mock('../../lib/data', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/data')>()),
  usePlayers: vi.fn(),
  useSessions: vi.fn(),
}));

beforeEach(async () => {
  await setLanguage('en');
  seed({ players: [player(1)], stints: [stint('p1', 0, 30)] });
});

describe('viewForPath', () => {
  it('maps each URL to its view, ignoring a trailing slash and unknown sub-paths', () => {
    expect(viewForPath('/fairness')).toBe('fair');
    expect(viewForPath('/fairness/')).toBe('fair');
    expect(viewForPath('/fairness/load')).toBe('load');
    expect(viewForPath('/fairness/pitch/')).toBe('pitch');
    expect(viewForPath('/fairness/other')).toBe('fair');
  });
});

describe('insights routes', () => {
  it('has one absolute path per view', () => {
    const paths = (insightsRoutes[0]?.children ?? []).map((route) => route.path);
    expect(paths).toEqual(['/fairness', '/fairness/load', '/fairness/pitch']);
  });
});

describe('FairnessPage', () => {
  it('has one page heading and a switcher with the current view selected', async () => {
    renderInsights('/fairness/load');
    expect(await screen.findByRole('heading', { level: 1, name: 'Fairness' })).toBeInTheDocument();
    const group = screen.getByRole('radiogroup', { name: 'Choose a view' });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Training load' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Fair share' })).not.toBeChecked();
  });

  it('keeps the view in the URL as the switcher is used', async () => {
    const { user } = renderInsights('/fairness');
    expect(screen.getByRole('radio', { name: 'Fair share' })).toBeChecked();
    expect(await screen.findByRole('heading', { name: 'Second look' })).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'Pitch use' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/fairness/pitch');
    expect(screen.getByRole('radio', { name: 'Pitch use' })).toBeChecked();
    expect(await screen.findByText('No completed sessions to look at yet')).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'Training load' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/fairness/load');

    await user.click(screen.getByRole('radio', { name: 'Fair share' }));
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/fairness$/);
  });

  it('opens straight on the view a link points at', async () => {
    renderInsights('/fairness/pitch');
    expect(await screen.findByText('No completed sessions to look at yet')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Pitch use' })).toBeChecked();
  });
});
