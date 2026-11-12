import { act, screen, within } from '@testing-library/react';
import { MotionConfig } from 'motion/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { goalSequences } from '../../engine/pro';
import i18n from '../../i18n';
import { FINAL_2018, loadMatch } from '../../test/proFixtures';
import { renderUi } from '../../ui/testUtils';
import { GoalReplay } from './GoalReplay';
import { NetworkCard } from './NetworkCard';
import { TerritoryCard } from './TerritoryCard';

vi.mock('./GoalReplay3D', () => ({
  GoalReplay3D: ({ progress }: { progress: number }) => (
    <div data-testid="replay-3d">{String(progress)}</div>
  ),
}));

const match = loadMatch(FINAL_2018);
const names = ['France', 'Croatia'] as const;
const frames: FrameRequestCallback[] = [];

beforeEach(async () => {
  await i18n.changeLanguage('en');
  frames.length = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('NetworkCard', () => {
  it('draws eleven starters, focuses one on tap and switches team', async () => {
    const { user } = renderUi(
      <NetworkCard players={match.players} events={match.events} names={names} />,
    );
    const pogba = screen.getByRole('button', { name: /^P\. Pogba, \d+ passes/ });
    expect(screen.getAllByRole('button', { name: /passes\. Show only/ })).toHaveLength(11);
    await user.click(pogba);
    expect(pogba).toHaveAttribute('aria-pressed', 'true');
    await user.click(pogba);
    expect(pogba).toHaveAttribute('aria-pressed', 'false');
    expect(
      screen.getByRole('table', { name: 'France: passes between pairs of players' }),
    ).toHaveTextContent('P. PogbaK. Mbappé8');
    await user.click(screen.getByRole('radio', { name: 'Croatia' }));
    expect(screen.getByRole('button', { name: /^L\. Modrić/ })).toBeInTheDocument();
  });

  it('is empty before anyone has passed', () => {
    renderUi(<NetworkCard players={match.players} events={[]} names={names} />);
    expect(screen.queryAllByRole('button', { name: /passes\./ })).toHaveLength(0);
  });
});

describe('TerritoryCard', () => {
  it('shows the zones, the thirds and the final-third passes, with a table', () => {
    renderUi(<TerritoryCard events={match.events} names={names} />);
    expect(screen.getByRole('img', { name: /France attacking left to right/ })).toBeInTheDocument();
    const table = screen.getByRole('table', { name: 'Touches by zone' });
    expect(within(table).getAllByRole('row')).toHaveLength(25);
    expect(screen.getByText('Passes into the final third')).toBeInTheDocument();
  });
});

describe('GoalReplay', () => {
  const sequence = goalSequences(match).find((s) => s.goal.scorer === 'K. Mbappé');
  if (sequence === undefined) throw new Error('Mbappé goal missing');

  it('plays the build-up frame by frame and can be replayed', async () => {
    const { user, container } = renderUi(<GoalReplay sequence={sequence} names={names} />);
    expect(screen.getByRole('heading', { level: 3, name: "65' K. Mbappé" })).toBeInTheDocument();
    const ball = () => container.querySelector('circle.fill-raised');
    const full = ball()?.getAttribute('cx');
    await user.click(screen.getByRole('button', { name: "Play the build-up to the 65' goal" }));
    act(() => {
      for (const callback of frames.splice(0)) callback(1000);
    });
    act(() => {
      for (const callback of frames.splice(0)) callback(1500);
    });
    expect(ball()?.getAttribute('cx')).not.toBe(full);
    await user.click(screen.getByRole('button', { name: "Pause the build-up to the 65' goal" }));
    await user.click(screen.getByRole('button', { name: "Replay the build-up to the 65' goal" }));
    act(() => {
      for (const callback of frames.splice(0)) callback(0);
    });
    act(() => {
      for (const callback of frames.splice(0)) callback(60_000);
    });
    expect(ball()?.getAttribute('cx')).toBe(full);
    expect(
      screen.getByRole('button', { name: "Play the build-up to the 65' goal" }),
    ).toBeInTheDocument();
  });

  it('switches to the 3D view when the browser can draw it', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      (() => ({})) as unknown as HTMLCanvasElement['getContext'],
    );
    const { user } = renderUi(<GoalReplay sequence={sequence} names={names} />);
    await user.click(screen.getByRole('radio', { name: '3D' }));
    expect(await screen.findByTestId('replay-3d')).toHaveTextContent('1');
    expect(screen.getByRole('img', { name: /Build-up of/ })).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'From above' }));
    expect(screen.queryByTestId('replay-3d')).toBeNull();
  });

  it('shows the whole route at once, with no controls, for reduced motion', () => {
    renderUi(
      <MotionConfig reducedMotion="always">
        <GoalReplay sequence={sequence} names={names} />
      </MotionConfig>,
    );
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText(/Mbappé/, { selector: 'p' })).toBeInTheDocument();
  });
});
