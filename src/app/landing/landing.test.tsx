import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import { Hero } from './Hero';
import MatchDay from './MatchDay';
import { ReplayTile } from './ReplayTile';
import { Tiles } from './Tiles';

function show(node: React.ReactNode) {
  return render(<MemoryRouter>{node}</MemoryRouter>);
}

beforeEach(async () => {
  await i18n.changeLanguage('en');
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('landing hero', () => {
  it('says what Klupa is and opens the demo club in one tap', async () => {
    const onDemo = vi.fn();
    show(<Hero demoBusy={false} onDemo={onDemo} />);
    expect(
      screen.getByRole('heading', { level: 1, name: 'The match, read honestly.' }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try the demo club' }));
    expect(onDemo).toHaveBeenCalledOnce();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '#landing-sign-in',
    );
  });

  it('blocks a second tap while the demo club is opening', () => {
    show(<Hero demoBusy onDemo={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Try the demo club' })).toBeDisabled();
  });
});

describe('landing tiles', () => {
  it('leads into every public screen', () => {
    show(<Tiles />);
    expect(screen.getByRole('link', { name: 'Watch it as live' })).toHaveAttribute(
      'href',
      '/pro/2058017',
    );
    expect(screen.getByRole('link', { name: 'Open the shot lab' })).toHaveAttribute(
      'href',
      '/shot',
    );
    expect(screen.getByRole('link', { name: 'See the research behind it' })).toHaveAttribute(
      'href',
      '/evidence',
    );
  });

  it('gives each picture one sentence for a screen reader', () => {
    show(<Tiles />);
    expect(screen.getByRole('img', { name: /three lines for the last 3, 5 and 10/ })).toBeVisible();
    expect(screen.getByText('France 4, Croatia 2')).toBeInTheDocument();
    expect(screen.getByText('86%')).toBeInTheDocument();
  });

  it('shows the research figure from the result file, to one decimal', () => {
    show(<Tiles />);
    expect(screen.getByText('18.9%')).toBeInTheDocument();
    expect(
      screen.getByText(/of the moments where both views lean, across 1,941 matches/),
    ).toBeVisible();
  });

  it('is written in Bosnian too', async () => {
    await i18n.changeLanguage('bs');
    show(<Tiles />);
    expect(
      screen.getByRole('heading', { name: 'Svako dijete dobija minute.' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Gledaj kao uživo' })).toBeInTheDocument();
  });
});

describe('landing match-day tile', () => {
  it('shows the real live match centre, reading what its label says, and keeps it out of reach', () => {
    show(<MatchDay />);
    expect(
      screen.getByRole('heading', { name: 'One tap on the touchline. The whole bench sees it.' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/lead the visitors 2 to 1 and are on top/)).toBeInTheDocument();
    // The picture agrees with the sentence: same score, same verdict.
    const picture = screen.getByText('U13 on top').closest('[inert]');
    expect(picture).not.toBeNull();
    expect(picture).toHaveAttribute('aria-hidden', 'true');
    expect(picture).toHaveTextContent('2 : 1');
    expect(screen.queryByRole('region', { name: 'Live match centre' })).not.toBeInTheDocument();
  });
});

describe('landing replay film', () => {
  function stubMotion(reduced: boolean) {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: reduced })),
    );
  }

  it('plays without sound, and its button follows what the film is actually doing', async () => {
    stubMotion(false);
    let paused = true;
    vi.spyOn(HTMLMediaElement.prototype, 'paused', 'get').mockImplementation(() => paused);
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {
      paused = true;
    });
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => {
      paused = false;
      return Promise.resolve();
    });
    show(<ReplayTile />);
    const film = screen.getByLabelText(/Players moving on a pitch drawn in 3D/);
    expect(film).toHaveProperty('muted', true);
    expect(screen.getByRole('link', { name: 'Open the replay' })).toHaveAttribute(
      'href',
      '/movement',
    );

    // A browser that refuses to start a film by itself: the button offers to play it.
    expect(screen.getByRole('button', { name: 'Play the video' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Play the video' }));
    expect(play).toHaveBeenCalledOnce();
    fireEvent.play(film);

    await userEvent.click(screen.getByRole('button', { name: 'Pause the video' }));
    expect(pause).toHaveBeenCalledOnce();
    fireEvent.pause(film);
    expect(screen.getByRole('button', { name: 'Play the video' })).toBeInTheDocument();
  });

  it('stays still for anyone who asked for less motion', () => {
    stubMotion(true);
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    show(<ReplayTile />);
    expect(pause).toHaveBeenCalled();
    expect(screen.getByLabelText(/Players moving on a pitch drawn in 3D/)).not.toHaveAttribute(
      'autoplay',
    );
    expect(screen.getByRole('button', { name: 'Play the video' })).toBeInTheDocument();
  });
});
