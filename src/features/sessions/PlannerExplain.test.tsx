import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DRILLS } from '../../data/drills';
import { planForAttendance, planSession } from '../../engine';
import i18n from '../../i18n';
import { PlannerPage } from './PlannerPage';
import { toConstraints } from './constraints';
import {
  BASE_FORM as BASE,
  CLUB,
  SESSION_ID,
  drillName,
  makePlayers,
  queryResult,
  renderAt,
} from './test-utils';

const mocks = vi.hoisted(() => ({
  players: vi.fn(),
  matches: vi.fn(),
  insertSession: vi.fn(),
}));

vi.mock('../../lib/club', () => ({ useActiveClub: () => CLUB }));
vi.mock('../../lib/data', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/data')>()),
  usePlayers: () => mocks.players() as unknown,
  useMatches: () => mocks.matches() as unknown,
}));
vi.mock('./api', () => ({
  insertSession: mocks.insertSession,
  fetchSession: vi.fn(),
  fetchAttendance: vi.fn(),
  fetchObservations: vi.fn(),
  updateSessionStatus: vi.fn(),
  upsertAttendance: vi.fn(),
  upsertObservation: vi.fn(),
}));

function renderPlanner(search = '', squad = 12) {
  mocks.players.mockReturnValue(queryResult({ data: makePlayers(squad) }));
  return renderAt(`/training/new${search}`, [
    { path: '/training/new', element: <PlannerPage /> },
    { path: '/training/:sessionId', element: <p>session page</p> },
    { path: '/training', element: <p>sessions list</p> },
  ]);
}

const blockButtons = () => screen.getAllByRole('button', { name: /Open details/ });

beforeEach(async () => {
  await i18n.changeLanguage('en');
  mocks.insertSession.mockReset();
  mocks.insertSession.mockResolvedValue(SESSION_ID);
  mocks.matches.mockReturnValue(queryResult({ data: [] }));
});

describe('a night that cannot be planned', () => {
  async function removeBalls() {
    renderPlanner();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Balls' }));
  }

  it('says so, lists why each drill was turned away, and blocks the save', async () => {
    await removeBalls();
    const plan = planSession(DRILLS, {
      ...toConstraints(BASE, 'u13'),
      equipment: ['cones', 'bibs', 'small_goals'],
    });
    expect(plan.feasible).toBe(false);
    expect(screen.getByRole('heading', { name: 'No main drill fits tonight' })).toBeInTheDocument();
    expect(screen.queryAllByRole('button', { name: /Open details/ })).toHaveLength(0);
    const missing = plan.rejected.filter((entry) => entry.reason === 'MISSING_EQUIPMENT');
    expect(missing.length).toBeGreaterThan(0);
    expect(screen.getAllByText(/^Needs .*Balls/)).toHaveLength(missing.length);
    plan.rejected.forEach((rejected) => {
      expect(screen.getByText(drillName(rejected.drillKey))).toBeInTheDocument();
    });
    const save = screen.getByRole('button', { name: 'Save session' });
    expect(save).toBeDisabled();
    expect(save).toHaveAccessibleDescription(
      /No main drill fits tonight, so there is nothing to save/,
    );
  });

  it('names the other reasons with the number that decides it', async () => {
    renderPlanner('?focus=pressing', 8);
    const user = userEvent.setup();
    await user.click(screen.getByRole('radio', { name: 'Quarter' }));
    await user.click(screen.getByRole('button', { name: 'Cones' }));
    expect(screen.getByRole('heading', { name: 'No main drill fits tonight' })).toBeInTheDocument();
    expect(screen.getAllByText(/^Needs more space: at least a /).length).toBeGreaterThan(0);
  });
});

describe('if fewer players come', () => {
  it('names the drill that takes over and the number it applies from', () => {
    renderPlanner('', 13);
    const attendance = planForAttendance(
      DRILLS,
      toConstraints({ ...BASE, players: 13 }, 'u13'),
      [13, 11, 9],
    );
    const point = attendance.switchPoints[0];
    expect(point).toEqual({ players: 11, from: 'possession-neutrals', to: 'receive-turn-channel' });
    expect(screen.getByRole('heading', { name: 'If fewer players come' })).toBeInTheDocument();
    expect(
      screen.getByText(
        `With 11 or fewer players, the main drill changes to ${drillName('receive-turn-channel')}.`,
      ),
    ).toBeInTheDocument();
  });

  it('says so when no main drill fits any more', () => {
    renderPlanner('', 4);
    expect(screen.getByText('With 2 or fewer, no main drill fits.')).toBeInTheDocument();
  });

  it('says the plan holds when nothing changes', () => {
    renderPlanner();
    expect(screen.getByText('The same main drill works down to 8 players.')).toBeInTheDocument();
  });

  it('says which drill becomes possible when tonight fits none', () => {
    renderPlanner('?focus=pressing', 21);
    expect(
      screen.getByText(
        `With 17 or fewer players, a main drill fits: ${drillName('pressure-box')}.`,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'No main drill fits tonight' })).toBeInTheDocument();
  });
});

describe('fair rotation', () => {
  it('shows six rounds by shirt number and label, and an even share of turns', () => {
    renderPlanner();
    const table = screen.getByRole('table', { name: 'Who takes the key role in each round' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(6);
    expect(within(rows[0] as HTMLElement).getByText('Round 1')).toBeInTheDocument();
    // A third of 12 expected players is 4 per round: 24 turns shared by 12 players.
    expect(within(rows[0] as HTMLElement).getAllByRole('listitem')).toHaveLength(4);
    expect(within(rows[0] as HTMLElement).getByText('Player 1')).toBeInTheDocument();
    expect(screen.getByText('Everyone gets 2 turns.')).toBeInTheDocument();
  });

  it('says N or N+1 when the turns cannot be equal', () => {
    renderPlanner('', 10);
    expect(screen.getByText('Everyone gets 1 or 2 turns.')).toBeInTheDocument();
  });

  it('asks for players when the squad is empty', () => {
    renderPlanner('', 0);
    expect(
      screen.getByText('Add players to your squad to see who takes each turn.'),
    ).toBeInTheDocument();
  });
});

describe('the drill sheet', () => {
  it('opens a block and shows set-up, coaching points and both variations', async () => {
    renderPlanner();
    const user = userEvent.setup();
    await user.click(blockButtons()[1] as HTMLElement);
    const sheet = await screen.findByRole('dialog', { name: 'Receive and turn in a channel' });
    const drill = DRILLS.find((entry) => entry.key === 'receive-turn-channel');
    expect(within(sheet).getByText(drill?.setup.en ?? '')).toBeInTheDocument();
    expect(within(sheet).getByText(drill?.coachingPoints[0]?.en ?? '')).toBeInTheDocument();
    expect(within(sheet).getByRole('heading', { name: 'Easier version' })).toBeInTheDocument();
    expect(within(sheet).getByText(drill?.easier.en ?? '')).toBeInTheDocument();
    expect(within(sheet).getByText(drill?.harder.en ?? '')).toBeInTheDocument();
    await user.click(within(sheet).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
