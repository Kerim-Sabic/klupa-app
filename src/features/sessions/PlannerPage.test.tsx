import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DRILLS } from '../../data/drills';
import { planSession } from '../../engine';
import i18n from '../../i18n';
import { PlannerPage } from './PlannerPage';
import { toConstraints } from './constraints';
import {
  BASE_FORM as BASE,
  CLUB,
  MATCH_ID,
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

describe('PlannerPage states', () => {
  it('shows a loading status while the squad loads', () => {
    mocks.players.mockReturnValue(queryResult('pending'));
    renderAt('/training/new', [{ path: '/training/new', element: <PlannerPage /> }]);
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Plan a session' })).toBeInTheDocument();
  });

  it('offers a retry when the squad cannot be loaded', async () => {
    const refetch = vi.fn();
    mocks.players.mockReturnValue(queryResult('error', refetch));
    renderAt('/training/new', [{ path: '/training/new', element: <PlannerPage /> }]);
    expect(screen.getByRole('alert')).toHaveTextContent('This could not be loaded.');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));
    expect(refetch).toHaveBeenCalledOnce();
  });
});

describe('the live plan', () => {
  it('starts from the squad size with the default kit and plans straight away', () => {
    renderPlanner();
    expect(screen.getByRole('status')).toHaveTextContent('12');
    expect(screen.getByRole('radio', { name: '60 min' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Half' })).toBeChecked();
    for (const name of ['Balls', 'Cones', 'Bibs', 'Small goals']) {
      expect(screen.getByRole('button', { name, pressed: true })).toBeInTheDocument();
    }
    expect(
      screen.getByRole('button', { name: 'Full-size goals', pressed: false }),
    ).toBeInTheDocument();

    const plan = planSession(DRILLS, toConstraints(BASE, 'u13'));
    const buttons = blockButtons();
    expect(buttons).toHaveLength(plan.blocks.length);
    plan.blocks.forEach((block, index) => {
      expect(buttons[index]).toHaveAccessibleName(
        expect.stringContaining(`${drillName(block.drillKey)}, ${String(block.minutes)} min`),
      );
    });
    expect(
      screen.getByText(
        `60 minutes · about ${String(Math.round(plan.expectedRepsPerPlayer))} attempts per player (estimate)`,
      ),
    ).toBeInTheDocument();
  });

  it('shows each block with its minutes, its estimate and its reasons', () => {
    renderPlanner();
    const plan = planSession(DRILLS, toConstraints(BASE, 'u13'));
    const first = within(blockButtons()[0] as HTMLElement);
    expect(first.getByText('Warm-up')).toBeInTheDocument();
    expect(first.getByText('0–10 min')).toBeInTheDocument();
    expect(
      first.getByText(
        `About ${String(Math.round(plan.blocks[0]?.expectedRepsPerPlayer ?? 0))} attempts per player (estimate)`,
      ),
    ).toBeInTheDocument();
    expect(first.getByText('Matches the focus')).toBeInTheDocument();
    expect(first.getByText('Fits the numbers')).toBeInTheDocument();
    expect(first.getByText('Fits the space')).toBeInTheDocument();
    expect(first.getByText('Most attempts')).toBeInTheDocument();
    // With small goals ticked the planner finds a game for this focus, so nothing is borrowed.
    const lastBlock = plan.blocks[plan.blocks.length - 1];
    expect(lastBlock?.phase).toBe('game');
    expect(lastBlock?.reasons).toContain('MATCHES_FOCUS');
    expect(lastBlock?.reasons).not.toContain('OTHER_FOCUS');
    const game = within(blockButtons()[plan.blocks.length - 1] as HTMLElement);
    expect(game.getByText('Matches the focus')).toBeInTheDocument();
    expect(game.queryByText('Borrowed from another focus')).not.toBeInTheDocument();
  });

  it('re-plans when the focus changes', async () => {
    renderPlanner();
    await userEvent.setup().selectOptions(screen.getByLabelText('Focus'), 'pressing');
    const plan = planSession(DRILLS, toConstraints({ ...BASE, focus: 'pressing' }, 'u13'));
    const mainKeys = plan.blocks.filter((b) => b.phase === 'main').map((b) => b.drillKey);
    mainKeys.forEach((key) => {
      expect(
        screen.getByRole('button', { name: new RegExp(`Main drill: ${drillName(key)}`) }),
      ).toBeInTheDocument();
    });
    expect(blockButtons()).toHaveLength(plan.blocks.length);
  });

  it('re-plans when the length changes', async () => {
    renderPlanner();
    await userEvent.setup().click(screen.getByRole('radio', { name: '90 min' }));
    const plan = planSession(DRILLS, toConstraints({ ...BASE, minutes: 90 }, 'u13'));
    expect(
      screen.getByText(
        `90 minutes · about ${String(Math.round(plan.expectedRepsPerPlayer))} attempts per player (estimate)`,
      ),
    ).toBeInTheDocument();
    expect(blockButtons()[0]).toHaveAccessibleName(
      expect.stringContaining(`${String(plan.blocks[0]?.minutes)} min`),
    );
  });

  it('re-plans when the number of players changes', async () => {
    renderPlanner('', 13);
    expect(screen.getByRole('status')).toHaveTextContent('13');
    const user = userEvent.setup();
    const before = planSession(DRILLS, toConstraints({ ...BASE, players: 13 }, 'u13'));
    await user.click(screen.getByRole('button', { name: 'Fewer players expected' }));
    await user.click(screen.getByRole('button', { name: 'Fewer players expected' }));
    expect(screen.getByRole('status')).toHaveTextContent('11');
    const after = planSession(DRILLS, toConstraints({ ...BASE, players: 11 }, 'u13'));
    expect(before.blocks[1]?.drillKey).not.toBe(after.blocks[1]?.drillKey);
    expect(
      screen.getByRole('button', {
        name: new RegExp(`Main drill: ${drillName('receive-turn-channel')}`),
      }),
    ).toBeInTheDocument();
  });

  it('keeps the expected players between 4 and 30', () => {
    const { unmount } = renderPlanner('', 3);
    expect(screen.getByRole('status')).toHaveTextContent('4');
    expect(screen.getByRole('button', { name: 'Fewer players expected' })).toBeDisabled();
    unmount();
    renderPlanner('', 40);
    expect(screen.getByRole('status')).toHaveTextContent('30');
    expect(screen.getByRole('button', { name: 'More players expected' })).toBeDisabled();
  });

  it('takes the focus from the link and ignores one it does not know', () => {
    const { unmount } = renderPlanner('?focus=pressing');
    expect(screen.getByLabelText('Focus')).toHaveValue('pressing');
    unmount();
    renderPlanner('?focus=dribbling');
    expect(screen.getByLabelText('Focus')).toHaveValue('receiving_under_pressure');
  });
});

describe('saving', () => {
  function setDate(value: string) {
    fireEvent.change(screen.getByLabelText('Date'), { target: { value } });
  }

  it('stores the session, its drills in order and the whole squad, then opens it', async () => {
    renderPlanner('?focus=pressing');
    setDate('2026-11-12');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Save session' }));
    const plan = planSession(DRILLS, toConstraints({ ...BASE, focus: 'pressing' }, 'u13'));
    await waitFor(() => {
      expect(mocks.insertSession).toHaveBeenCalledOnce();
    });
    expect(mocks.insertSession).toHaveBeenCalledWith(
      { clubId: 'club-1', teamId: 'team-1' },
      {
        session: {
          held_on: '2026-11-12',
          focus: 'pressing',
          duration_minutes: 60,
          area: 'half',
          expected_players: 12,
          floodlit: false,
          source_match_id: null,
        },
        drills: plan.blocks.map((block, index) => ({
          position: index + 1,
          drill_key: block.drillKey,
          minutes: block.minutes,
        })),
        playerIds: makePlayers(12).map((player) => player.id),
      },
    );
    expect(await screen.findByText('session page')).toBeInTheDocument();
  });

  it('saves the floodlight and pitch choices', async () => {
    renderPlanner();
    const user = userEvent.setup();
    setDate('2026-11-12');
    await user.click(screen.getByRole('button', { name: 'Floodlit' }));
    await user.click(screen.getByRole('radio', { name: 'Full' }));
    await user.click(screen.getByRole('button', { name: 'Save session' }));
    await waitFor(() => {
      expect(mocks.insertSession).toHaveBeenCalledOnce();
    });
    expect(mocks.insertSession.mock.calls[0]?.[1]).toMatchObject({
      session: { floodlit: true, area: 'full' },
    });
  });

  it('stores the match the session was planned from when it is one of the team matches', async () => {
    mocks.matches.mockReturnValue(
      queryResult({
        data: [{ id: MATCH_ID, opponent: 'FK Rival', played_on: '2026-11-08', status: 'finished' }],
      }),
    );
    renderPlanner(`?match=${MATCH_ID}`);
    expect(screen.getByText('Planned from your match against FK Rival.')).toBeInTheDocument();
    setDate('2026-11-12');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Save session' }));
    await waitFor(() => {
      expect(mocks.insertSession).toHaveBeenCalledOnce();
    });
    expect(mocks.insertSession.mock.calls[0]?.[1]).toMatchObject({
      session: { source_match_id: MATCH_ID },
    });
  });

  it('ignores a match that is malformed or not the team’s', async () => {
    const { unmount } = renderPlanner('?match=42');
    expect(screen.queryByText(/Planned from your match/)).not.toBeInTheDocument();
    unmount();
    renderPlanner(`?match=${MATCH_ID}`);
    expect(screen.queryByText(/Planned from your match/)).not.toBeInTheDocument();
    setDate('2026-11-12');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Save session' }));
    await waitFor(() => {
      expect(mocks.insertSession).toHaveBeenCalledOnce();
    });
    expect(mocks.insertSession.mock.calls[0]?.[1]).toMatchObject({
      session: { source_match_id: null },
    });
  });

  it('explains an empty or impossible date next to the field and does not save', () => {
    renderPlanner();
    setDate('');
    expect(screen.getByLabelText('Date')).toBeInvalid();
    expect(screen.getByText('Enter a valid date.')).toBeInTheDocument();
    const save = screen.getByRole('button', { name: 'Save session' });
    expect(save).toBeDisabled();
    expect(save).toHaveAccessibleDescription('Enter a valid date to save.');
    expect(mocks.insertSession).not.toHaveBeenCalled();
  });

  it('keeps the plan on screen and says what went wrong when the save fails', async () => {
    mocks.insertSession.mockRejectedValue({ code: '42501' });
    renderPlanner();
    setDate('2026-11-12');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Save session' }));
    expect(await screen.findByText('You do not have permission to do that.')).toBeInTheDocument();
    expect(screen.queryByText('session page')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save session' })).toBeEnabled();
  });
});

describe('Bosnian', () => {
  it('shows the planner in Bosnian, with the drill names too', async () => {
    await i18n.changeLanguage('bs');
    renderPlanner('?focus=pressing');
    expect(screen.getByRole('heading', { level: 1, name: 'Planiraj trening' })).toBeInTheDocument();
    expect(screen.getByLabelText('Fokus')).toHaveValue('pressing');
    expect(screen.getByRole('button', { name: 'Sačuvaj trening' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Otvori detalje/ }).length).toBeGreaterThan(0);
    expect(screen.getByText('Pravedna rotacija')).toBeInTheDocument();
  });
});
