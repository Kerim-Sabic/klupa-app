import type { LineupStep } from './api';
import type { Player } from '../../lib/data';
import type { ClockPhase } from './clock';
import type { StintRow } from './model';

/** The clock reading minutes are measured against. */
export interface ClockReading {
  readonly period: number;
  readonly seconds: number;
}

/**
 * Seconds a player has been on the pitch. A stint left open in the current period runs to the
 * clock; one left open in an earlier period (its close failed) runs to the nominal period length.
 */
export function playedSeconds(
  stints: readonly StintRow[],
  playerId: string,
  clock: ClockReading,
  periodSeconds: number,
): number {
  let total = 0;
  for (const stint of stints) {
    if (stint.player_id !== playerId) continue;
    let end = stint.off_seconds;
    if (end === null) {
      if (stint.period === clock.period) end = clock.seconds;
      else if (stint.period < clock.period) end = Math.max(periodSeconds, stint.on_seconds);
      else end = stint.on_seconds;
    }
    total += Math.max(0, end - stint.on_seconds);
  }
  return total;
}

export function openStint(
  stints: readonly StintRow[],
  playerId: string,
  period: number,
): StintRow | undefined {
  return stints.find(
    (stint) =>
      stint.player_id === playerId && stint.period === period && stint.off_seconds === null,
  );
}

/**
 * Which period the lineup edits right now, or null when it is closed. Before kick-off the
 * starting players go on at 0:00 of period 1; between periods changes wait for the next start.
 */
export function lineupPeriod(phase: ClockPhase, clockPeriod: number): number | null {
  if (phase === 'before') return 1;
  if (phase === 'running' || phase === 'paused') return clockPeriod;
  return null;
}

export type StintChange =
  | {
      readonly type: 'insert';
      readonly playerId: string;
      readonly period: number;
      readonly onSeconds: number;
    }
  | { readonly type: 'close'; readonly stintId: string; readonly offSeconds: number }
  | { readonly type: 'delete'; readonly stintId: string };

/**
 * Turning a player off closes their stint; if no time has passed since they went on, the stint
 * is removed instead, because the database requires off_seconds to be after on_seconds.
 */
function closeOrDelete(stint: StintRow, seconds: number): StintChange {
  return seconds > stint.on_seconds
    ? { type: 'close', stintId: stint.id, offSeconds: seconds }
    : { type: 'delete', stintId: stint.id };
}

export function toggleChange(
  stints: readonly StintRow[],
  playerId: string,
  period: number,
  seconds: number,
): StintChange {
  const open = openStint(stints, playerId, period);
  if (open !== undefined) return closeOrDelete(open, seconds);
  return { type: 'insert', playerId, period, onSeconds: seconds };
}

/** Ending a period closes every stint still open in it at the final clock. */
export function closeAllChanges(
  stints: readonly StintRow[],
  period: number,
  seconds: number,
): StintChange[] {
  return stints
    .filter((stint) => stint.period === period && stint.off_seconds === null)
    .map((stint) => closeOrDelete(stint, seconds));
}

/**
 * The players to put back on at 0:00 of the next period: whoever was on at the final whistle of
 * the last one (closed at its end, or still open because the close did not reach the server).
 */
export function carryOver(
  stints: readonly StintRow[],
  period: number,
  endSeconds: number,
): string[] {
  const ids = stints
    .filter(
      (stint) =>
        stint.period === period && (stint.off_seconds === null || stint.off_seconds === endSeconds),
    )
    .map((stint) => stint.player_id);
  return [...new Set(ids)];
}

export interface LineupEntry {
  readonly player: Player;
  readonly seconds: number;
  readonly on: boolean;
  readonly notPlayed: boolean;
}

/**
 * The squad for the lineup sheet. Players who have not played yet come first, so the coach
 * finds them without scrolling; the order inside each group is the shirt number and never
 * changes while the clock runs, so a row does not jump from under a thumb.
 */
export function lineupEntries(
  players: readonly Player[],
  stints: readonly StintRow[],
  clock: ClockReading,
  periodSeconds: number,
  period: number | null,
): LineupEntry[] {
  const entries = players.map((player) => {
    const seconds = playedSeconds(stints, player.id, clock, periodSeconds);
    const isOn = period !== null && openStint(stints, player.id, period) !== undefined;
    const hasStint = stints.some((stint) => stint.player_id === player.id);
    return { player, seconds, on: isOn, notPlayed: seconds === 0 && !hasStint };
  });
  return entries.sort(
    (a, b) =>
      Number(b.notPlayed) - Number(a.notPlayed) || a.player.shirt_number - b.player.shirt_number,
  );
}

/** The same changes as the steps the database applies together. */
export function lineupSteps(changes: readonly StintChange[]): LineupStep[] {
  return changes.map((change) => {
    if (change.type === 'insert') {
      return {
        type: 'on',
        player: change.playerId,
        period: change.period,
        on_seconds: change.onSeconds,
      };
    }
    if (change.type === 'close') {
      return { type: 'off', stint: change.stintId, off_seconds: change.offSeconds };
    }
    return { type: 'remove', stint: change.stintId };
  });
}
