import { describe, expect, it } from 'vitest';
import { FINAL_2016, FINAL_2018, golden, loadMatch } from '../../test/proFixtures';
import { passNetwork } from './passNetwork';

describe('passNetwork against the Python golden networks', () => {
  it.each([[FINAL_2018], [FINAL_2016]])('match %i, home team, pairs of three or more', (id) => {
    const expected = golden.passNetwork[String(id)];
    const match = loadMatch(id);
    const network = passNetwork(match, expected?.team ?? 0, { startersOnly: false, minPasses: 3 });
    const name = (player: number) => match.players[player]?.name;
    expect(network.edges.map((edge) => [name(edge.from), name(edge.to), edge.count])).toEqual(
      expected?.edges,
    );
  });
});

describe('passNetwork', () => {
  const match = loadMatch(FINAL_2018);

  it('keeps the starters only by default and places each at the average of their passes', () => {
    const network = passNetwork(match, 0);
    expect(network.nodes).toHaveLength(11);
    for (const node of network.nodes) {
      expect(match.players[node.player]?.starter).toBe(true);
      expect(node.at.x).toBeGreaterThanOrEqual(0);
      expect(node.at.x).toBeLessThanOrEqual(100);
    }
    const pogba = network.nodes.find((node) => node.name === 'P. Pogba');
    const own = match.events.filter((e) => e.kind === 'pass' && e.player === pogba?.player);
    expect(pogba?.passes).toBe(own.length);
    expect(pogba?.at.x).toBeCloseTo(own.reduce((s, e) => s + (e.at?.x ?? 0), 0) / own.length, 9);
  });

  it('never links a player to himself or to the other team, and sorts by count', () => {
    const network = passNetwork(match, 1, { startersOnly: false });
    for (const edge of network.edges) {
      expect(edge.from).not.toBe(edge.to);
      expect(match.players[edge.to]?.team).toBe(1);
    }
    const counts = network.edges.map((edge) => edge.count);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
    expect(network.nodes.length).toBeGreaterThan(11);
  });

  it('is empty for a team with no passes', () => {
    expect(passNetwork({ players: match.players, events: [] }, 0)).toEqual({
      team: 0,
      nodes: [],
      edges: [],
    });
  });
});
