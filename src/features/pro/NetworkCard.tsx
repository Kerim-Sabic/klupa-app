import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  passNetwork,
  type Pair,
  type ProEvent,
  type ProMatch,
  type TeamIndex,
} from '../../engine/pro';
import { Card, Segmented } from '../../ui';
import { ProPitch, overlayPosition, toPitch } from './ProPitch';
import { labelSides, surname } from './replayModel';

/** Pairs with fewer accurate passes are not drawn (they still count in the node sizes). */
const DRAW_MIN = 2;
/** The table lists the pairs a reader can rely on. */
const TABLE_MIN = 3;
const STROKE = ['stroke-home', 'stroke-away'] as const;
const FILL = ['fill-home', 'fill-away'] as const;

/**
 * Who passed to whom, for one team at a time, drawn on its own half-and-half of the pitch
 * attacking left to right: each starter at the average spot of their passes, sized by how many
 * they made, linked by how often the ball went between them. Tap a player to see only theirs.
 */
export function NetworkCard({
  players,
  events,
  names,
}: {
  readonly players: ProMatch['players'];
  readonly events: readonly ProEvent[];
  readonly names: Pair<string>;
}) {
  const { t } = useTranslation();
  const [team, setTeam] = useState<TeamIndex>(0);
  const [focus, setFocus] = useState<number | null>(null);
  const network = useMemo(() => passNetwork({ players, events }, team), [players, events, team]);
  const most = Math.max(1, ...network.nodes.map((node) => node.passes));
  const strongest = Math.max(1, ...network.edges.map((edge) => edge.count));
  const at = new Map(network.nodes.map((node) => [node.player, node]));
  const name = (player: number) => players[player]?.name ?? '';
  const sides = labelSides(network.nodes.map((node) => node.at));
  const touches = (player: number) => focus === null || player === focus;

  return (
    <Card className="flex flex-col gap-4">
      <Segmented
        label={t('pro.network.team')}
        value={String(team)}
        onChange={(value) => {
          setTeam(value === '1' ? 1 : 0);
          setFocus(null);
        }}
        options={[
          { value: '0', label: names[0] },
          { value: '1', label: names[1] },
        ]}
      />
      <ProPitch
        label={t('pro.network.label', { team: names[team], players: network.nodes.length })}
        overlay={network.nodes.map((node, i) => {
          const pos = overlayPosition(node.at);
          const above = sides[i] === 'above';
          const pressed = focus === node.player;
          return (
            <button
              key={node.player}
              type="button"
              aria-pressed={pressed}
              aria-label={t('pro.network.player', { name: node.name, passes: node.passes })}
              onClick={() => {
                setFocus(pressed ? null : node.player);
              }}
              style={pos}
              className="absolute grid size-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full"
            >
              <span
                aria-hidden="true"
                className={`absolute ${above ? 'bottom-[calc(50%+14px)]' : 'top-[calc(50%+14px)]'} rounded-full px-1.5 text-[12px] leading-4 font-semibold whitespace-nowrap ${
                  touches(node.player) ? 'bg-raised/85 text-ink' : 'text-ink-soft/70'
                }`}
              >
                {surname(node.name)}
              </span>
            </button>
          );
        })}
      >
        {network.edges
          .filter((edge) => edge.count >= DRAW_MIN)
          .map((edge) => {
            const a = at.get(edge.from);
            const b = at.get(edge.to);
            if (a === undefined || b === undefined) return null;
            const p = toPitch(a.at);
            const q = toPitch(b.at);
            const lit = focus === null || edge.from === focus || edge.to === focus;
            return (
              <line
                key={`${String(edge.from)}-${String(edge.to)}`}
                x1={p.x}
                y1={p.y}
                x2={q.x}
                y2={q.y}
                className={STROKE[team]}
                strokeLinecap="round"
                strokeWidth={0.3 + (edge.count / strongest) * 1.6}
                opacity={lit ? 0.25 + (edge.count / strongest) * 0.6 : 0.06}
              />
            );
          })}
        {network.nodes.map((node) => {
          const p = toPitch(node.at);
          return (
            <circle
              key={node.player}
              cx={p.x}
              cy={p.y}
              r={1.4 + Math.sqrt(node.passes / most) * 2.4}
              className={`${FILL[team]} stroke-raised`}
              strokeWidth={0.5}
              opacity={touches(node.player) ? 1 : 0.3}
            />
          );
        })}
      </ProPitch>
      <p className="text-footnote text-ink-soft">{t('pro.network.note')}</p>
      <details className="text-footnote text-ink-soft">
        <summary className="min-h-11 cursor-pointer py-3 font-semibold text-ink">
          {t('pro.network.table')}
        </summary>
        <table className="w-full tabular-nums">
          <caption className="sr-only">{t('pro.network.caption', { team: names[team] })}</caption>
          <thead>
            <tr>
              <th scope="col" className="text-left">
                {t('pro.network.col.from')}
              </th>
              <th scope="col" className="text-left">
                {t('pro.network.col.to')}
              </th>
              <th scope="col" className="text-right">
                {t('pro.network.col.passes')}
              </th>
            </tr>
          </thead>
          <tbody>
            {network.edges
              .filter((edge) => edge.count >= TABLE_MIN)
              .map((edge) => (
                <tr
                  key={`${String(edge.from)}-${String(edge.to)}`}
                  className="border-t border-hairline"
                >
                  <td className="py-1">{name(edge.from)}</td>
                  <td>{name(edge.to)}</td>
                  <td className="text-right">{edge.count}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </details>
    </Card>
  );
}
