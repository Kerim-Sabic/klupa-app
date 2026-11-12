interface PlayerRow {
  readonly player_id: string;
}

/** Replace a player's row in a cached list, or add it, without touching the others. */
export function putRow<Row extends PlayerRow>(rows: readonly Row[], row: Row): Row[] {
  const exists = rows.some((entry) => entry.player_id === row.player_id);
  return exists
    ? rows.map((entry) => (entry.player_id === row.player_id ? row : entry))
    : [...rows, row];
}

export function dropRow<Row extends PlayerRow>(rows: readonly Row[], playerId: string): Row[] {
  return rows.filter((entry) => entry.player_id !== playerId);
}
