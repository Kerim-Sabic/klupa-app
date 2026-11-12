import { screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import { renderPage, serveProData } from '../../test/proRender';
import { fetchProIndex, fetchProMatch } from './data';
import { ProListPage } from './ProListPage';

const page = (path = '/pro') => renderPage(path, [['/pro', <ProListPage key="list" />]]);

beforeEach(async () => {
  await i18n.changeLanguage('en');
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ProListPage', () => {
  it('features both finals and lists the World Cup by stage', async () => {
    serveProData();
    page();
    const finals = await screen.findByRole('region', { name: 'The two finals' });
    const links = within(finals).getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/pro/2058017',
      '/pro/1694440',
    ]);
    expect(within(finals).getByText('France 4–2 Croatia')).toBeInTheDocument();
    expect(within(finals).getByText(/After extra time/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Round of 16' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Group A' })).toBeInTheDocument();
    // Spain v Russia, Colombia v England and Russia v Croatia went 3–4 on penalties.
    expect(screen.getAllByText(/3–4 on penalties/)).toHaveLength(3);
  });

  it('switches tournament and searches by team, ignoring accents', async () => {
    serveProData();
    const { user } = page();
    await user.click(await screen.findByRole('radio', { name: 'Euro 2016' }));
    expect(screen.queryByRole('heading', { level: 3, name: 'Third place' })).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('Matches shown: 51');
    await user.type(screen.getByRole('searchbox', { name: 'Find a team' }), 'wales');
    expect(screen.getByRole('status')).toHaveTextContent('Matches shown: 6');
    await user.clear(screen.getByRole('searchbox'));
    await user.type(screen.getByRole('searchbox'), 'qqq');
    expect(screen.getByText('No team by that name here')).toBeInTheDocument();
  });

  it('opens on the tournament in the address and speaks Bosnian', async () => {
    serveProData();
    await i18n.changeLanguage('bs');
    page('/pro?t=euro2016&q=port');
    expect(await screen.findByRole('radio', { name: 'Euro 2016' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByRole('heading', { level: 3, name: 'Finale' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Grupa F' })).toBeInTheDocument();
  });

  it('says so when the list fails, and retries', { timeout: 10_000 }, async () => {
    const fetchMock = serveProData({ fail: ['index'] });
    const { user } = page();
    // The data hook retries a failed download twice before saying so.
    const alert = await screen.findByRole('alert', {}, { timeout: 6000 });
    expect(alert).toHaveTextContent('The match list did not load');
    serveProData();
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    await screen.findByRole('region', { name: 'The two finals' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe('data access', () => {
  it('refuses a file that holds another match and a list that is not a list', async () => {
    serveProData();
    const signal = new AbortController().signal;
    await expect(fetchProIndex(signal)).resolves.toMatchObject({ v: 1 });
    vi.stubGlobal('fetch', () =>
      Promise.resolve(new Response(JSON.stringify({ v: 1, nope: true }), { status: 200 })),
    );
    await expect(fetchProIndex(signal)).rejects.toThrow(/expected format/);
    serveProData();
    const realFetch = globalThis.fetch;
    vi.stubGlobal('fetch', (url: string) => realFetch(url.replace('1694440', '2058017')));
    await expect(fetchProMatch(1694440, signal)).rejects.toThrow(/another match/);
  });

  it('turns an HTTP failure into an error', async () => {
    serveProData();
    await expect(fetchProMatch(1, new AbortController().signal)).rejects.toThrow(/404/);
  });
});
