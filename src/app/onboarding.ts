import { supabase, type Enums } from '../lib/supabase';

export interface NewClubInput {
  readonly clubName: string;
  readonly teamName: string;
  readonly ageGroup: Enums['age_group'];
}

/**
 * Creates the club, the caller's owner membership and the first team in one database
 * transaction, so a dropped connection can never leave a club without a team. Whether the
 * club is a demo is decided by the database from the session, not sent from here.
 * Returns the new club id.
 */
export async function createClubWithTeam(input: NewClubInput): Promise<string> {
  const { data, error } = await supabase.rpc('create_club', {
    club_name: input.clubName,
    team_name: input.teamName,
    team_age: input.ageGroup,
  });
  if (error !== null) throw error;
  return data;
}
