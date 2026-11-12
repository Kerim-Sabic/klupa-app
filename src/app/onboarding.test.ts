import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createClubWithTeam } from './onboarding';

const db = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));

vi.mock('../lib/supabase', () => ({ supabase: { rpc: db.rpc, from: db.from } }));

const input = { clubName: 'FK Test', teamName: 'U11', ageGroup: 'u11' } as const;

beforeEach(() => {
  vi.clearAllMocks();
  db.rpc.mockResolvedValue({ data: 'club-1', error: null });
});

describe('createClubWithTeam', () => {
  it('creates the club and its first team in one call to the database', async () => {
    await expect(createClubWithTeam(input)).resolves.toBe('club-1');
    expect(db.rpc).toHaveBeenCalledTimes(1);
    expect(db.rpc).toHaveBeenCalledWith('create_club', {
      club_name: 'FK Test',
      team_name: 'U11',
      team_age: 'u11',
    });
    // No second request that could fail on its own and leave a club without a team.
    expect(db.from).not.toHaveBeenCalled();
  });

  it('never tells the database whether the club is a demo', async () => {
    await createClubWithTeam(input);
    expect(db.rpc.mock.calls[0]?.[1]).not.toHaveProperty('demo');
  });

  it('passes the database error on, such as the club limit', async () => {
    const failure = { code: '54000' };
    db.rpc.mockResolvedValue({ data: null, error: failure });
    await expect(createClubWithTeam(input)).rejects.toBe(failure);
  });
});
