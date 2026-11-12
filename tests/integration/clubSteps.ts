import { expect, it } from 'vitest';
import {
  countActivePlayers,
  erasePlayer,
  fetchClubSettings,
  insertPlayer,
  updateClubSettings,
  updatePlayer,
} from '../../src/features/club/api';
import {
  createDataRequest,
  deleteClub,
  exportClubData,
  listAuditLog,
  listDataRequests,
  resolveDataRequest,
} from '../../src/features/club/privacy/api';
import { consentStamp } from '../../src/features/club/model';
import { fetchActiveClub } from '../../src/lib/club';
import { fetchPlayers } from '../../src/lib/data';
import { need, type Scenario } from './support';

const EXPORT_SECTIONS = [
  'exported_at',
  'club',
  'members',
  'teams',
  'players',
  'matches',
  'match_events',
  'stints',
  'sessions',
  'session_drills',
  'session_attendance',
  'observations',
  'data_requests',
] as const;

export function clubSteps(s: Scenario): void {
  it('updates and reads back the club settings', async () => {
    const { clubId } = need(s.club, 'the club');
    const settings = {
      name: 'Klupa integration club renamed',
      floodlight_kw: 4.5,
      tariff_per_kwh: 0.1525,
      grid_kg_co2_per_kwh: 0.4,
    };
    await updateClubSettings(clubId, settings);
    expect(await fetchClubSettings(clubId)).toEqual(settings);
    // Clearing a factor writes null, which is how the settings form clears a field.
    const cleared = {
      ...settings,
      floodlight_kw: null,
      tariff_per_kwh: null,
      grid_kg_co2_per_kwh: null,
    };
    await updateClubSettings(clubId, cleared);
    expect(await fetchClubSettings(clubId)).toEqual(cleared);
    await updateClubSettings(clubId, settings);
  });

  it('adds, edits, archives and erases a player', async () => {
    const { clubId, teamId } = need(s.club, 'the club');
    const before = await countActivePlayers(clubId, teamId);
    await insertPlayer({
      club_id: clubId,
      team_id: teamId,
      label: 'Spare',
      shirt_number: 55,
      consent: 'granted',
      consent_recorded_at: new Date().toISOString(),
      birth_quarter: 2,
    });
    const find = async () =>
      (await fetchPlayers(clubId, teamId)).find((p) => p.shirt_number === 55);
    const added = need(await find(), 'the added player');
    expect(added).toMatchObject({ label: 'Spare', consent: 'granted', birth_quarter: 2 });
    expect(await countActivePlayers(clubId, teamId)).toBe(before + 1);

    await updatePlayer(clubId, added.id, { label: 'Spare edited', birth_quarter: 3 });
    expect(await find()).toMatchObject({ label: 'Spare edited', birth_quarter: 3 });

    // Consent moves the way the player form moves it: the stamp follows the status.
    for (const consent of ['withdrawn', 'not_recorded', 'granted'] as const) {
      await updatePlayer(clubId, added.id, {
        consent,
        consent_recorded_at: consentStamp(consent, new Date()),
      });
      expect(await find()).toMatchObject({ consent });
    }

    await updatePlayer(clubId, added.id, { archived_at: new Date().toISOString() });
    expect(await find()).toBeUndefined();
    expect(await countActivePlayers(clubId, teamId)).toBe(before);

    await erasePlayer(clubId, added.id);
    await expect(erasePlayer(clubId, added.id)).rejects.toMatchObject({ code: '42501' });
  });

  it('exports every section, and files and resolves a data request', async () => {
    const { clubId } = need(s.club, 'the club');
    const data = await exportClubData(clubId);
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      throw new Error('The export is not an object.');
    }
    for (const section of EXPORT_SECTIONS) expect(data).toHaveProperty(section);
    for (const section of ['players', 'matches', 'match_events', 'sessions'] as const) {
      const rows = data[section];
      expect(Array.isArray(rows) && rows.length > 0).toBe(true);
    }

    const requestId = await createDataRequest(clubId, 'export');
    expect(await listDataRequests(clubId)).toMatchObject([
      { id: requestId, kind: 'export', status: 'open', resolved_at: null },
    ]);
    await resolveDataRequest(clubId, requestId, 'completed', new Date().toISOString());
    const [resolved] = await listDataRequests(clubId);
    expect(resolved).toMatchObject({ id: requestId, status: 'completed' });
    expect(resolved?.resolved_at).not.toBeNull();
  });

  it('keeps an audit trail of column names only', async () => {
    const { clubId } = need(s.club, 'the club');
    const log = await listAuditLog(clubId);
    expect(log.length).toBeGreaterThan(0);
    const identifier = /^[a-z0-9_]+$/;
    for (const entry of log) {
      expect(entry.table_name).toMatch(identifier);
      for (const column of entry.changed_columns ?? []) expect(column).toMatch(identifier);
    }
    const text = JSON.stringify(log);
    for (const value of ['Spare', 'Integration opponents', 'Klupa integration']) {
      expect(text).not.toContain(value);
    }
  });

  it('deletes the club and leaves nothing to find', async () => {
    const userId = need(s.userId, 'the user id');
    const { clubId } = need(s.club, 'the club');
    await deleteClub(clubId);
    expect(await fetchActiveClub(userId)).toBeNull();
  });
}
