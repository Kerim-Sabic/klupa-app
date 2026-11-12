import type { Point, ProMatch, TeamIndex } from './schema';

/** A receiver is the next event's player only when it comes within this many seconds. */
export const RECEIVER_WINDOW_SECONDS = 10;

export interface NetworkNode {
  readonly player: number;
  readonly name: string;
  /** Passes this player made (accurate or not) in the counted set. */
  readonly passes: number;
  /** Average start position of those passes, in the team's own frame. */
  readonly at: Point;
}

export interface NetworkEdge {
  readonly from: number;
  readonly to: number;
  /** Accurate passes from `from` to `to`. */
  readonly count: number;
}

export interface PassNetwork {
  readonly team: TeamIndex;
  readonly nodes: readonly NetworkNode[];
  /** Sorted by count, most first, then passer and receiver name. */
  readonly edges: readonly NetworkEdge[];
}

export interface PassNetworkOptions {
  /** Only players who started (default), so the drawing shows one shape, not two. */
  readonly startersOnly?: boolean;
  /** Pairs with fewer accurate passes are left out. Default 1. */
  readonly minPasses?: number;
}

const byCodePoint = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Who passed to whom. The provider records no receiver, so a pass's receiver is read as the
 * player of the next event, when that event is the same team's, in the same period, names a
 * different player and comes within ten seconds. Only accurate passes make an edge.
 */
export function passNetwork(
  match: Pick<ProMatch, 'players' | 'events'>,
  team: TeamIndex,
  options: PassNetworkOptions = {},
): PassNetwork {
  const startersOnly = options.startersOnly ?? true;
  const minPasses = options.minPasses ?? 1;
  const counted = (player: number): boolean => {
    const entry = match.players[player];
    return entry !== undefined && entry.team === team && (!startersOnly || entry.starter);
  };

  const sums = new Map<number, { passes: number; x: number; y: number; placed: number }>();
  const pairs = new Map<string, NetworkEdge>();
  match.events.forEach((event, position) => {
    if (event.kind !== 'pass' || event.team !== team || !counted(event.player)) return;
    const sum = sums.get(event.player) ?? { passes: 0, x: 0, y: 0, placed: 0 };
    sum.passes += 1;
    if (event.at !== null) {
      sum.x += event.at.x;
      sum.y += event.at.y;
      sum.placed += 1;
    }
    sums.set(event.player, sum);

    const next = match.events[position + 1];
    if (!event.accurate || next === undefined) return;
    const received =
      next.team === team &&
      next.period === event.period &&
      next.player !== event.player &&
      next.t - event.t <= RECEIVER_WINDOW_SECONDS &&
      counted(next.player);
    if (!received) return;
    const key = `${String(event.player)}>${String(next.player)}`;
    const edge = pairs.get(key) ?? { from: event.player, to: next.player, count: 0 };
    pairs.set(key, { ...edge, count: edge.count + 1 });
  });

  const name = (player: number): string => match.players[player]?.name ?? '';
  const nodes: NetworkNode[] = [...sums.entries()]
    .filter(([, sum]) => sum.placed > 0)
    .map(([player, sum]) => ({
      player,
      name: name(player),
      passes: sum.passes,
      at: { x: sum.x / sum.placed, y: sum.y / sum.placed },
    }))
    .sort((a, b) => b.passes - a.passes || byCodePoint(a.name, b.name));
  const edges = [...pairs.values()]
    .filter((edge) => edge.count >= minPasses)
    .sort(
      (a, b) =>
        b.count - a.count ||
        byCodePoint(name(a.from), name(b.from)) ||
        byCodePoint(name(a.to), name(b.to)),
    );
  return { team, nodes, edges };
}
