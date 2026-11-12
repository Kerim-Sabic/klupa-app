import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { PathPoint } from '../../engine/tracking';
import type { Side } from '../../engine/types';
import { useClubName } from './clubs';
import type { Layers } from './LayerPanel';
import { convexHull, outfield, SPACE_COLS, SPACE_ROWS, type Readout } from './model';
import { pitchMarkings, type Point } from './pitch';

export interface Pitch2DProps {
  readonly readout: Readout;
  readonly layers: Layers;
  readonly selected: number | null;
  readonly onSelect: (slot: number) => void;
  readonly trail: readonly PathPoint[];
  readonly label: string;
}

/** Pitch y grows towards the far touchline; SVG y grows downwards. */
const svgPoints = (points: readonly Point[]) =>
  points.map((p) => `${p.x.toFixed(2)},${(-p.y).toFixed(2)}`).join(' ');

const SHAPE_CLASS: Readonly<Record<Side, string>> = {
  home: 'fill-home/15 stroke-home',
  away: 'fill-away/15 stroke-away [stroke-dasharray:1.6_1]',
};

/**
 * The match from above as SVG: the fallback without WebGL, the first view for reduced
 * motion, and what the tests render. Redrawn at the readout's pace, a few times a second.
 */
export function Pitch2D({ readout, layers, selected, onSelect, trail, label }: Pitch2DProps) {
  const { t } = useTranslation();
  const club = useClubName();
  const { frame, owners } = readout;
  const length = frame.lengthMetres;
  const width = frame.widthMetres;
  const markings = useMemo(() => pitchMarkings(length, width), [length, width]);
  const cellW = length / SPACE_COLS;
  const cellH = width / SPACE_ROWS;

  return (
    <svg
      viewBox={`${String(-length / 2 - 3)} ${String(-width / 2 - 3)} ${String(length + 6)} ${String(width + 6)}`}
      role="group"
      aria-label={label}
      className="block h-auto w-full rounded-card bg-pitch-soft"
    >
      <defs>
        <pattern
          id="movement-away-stripes"
          width="1.4"
          height="1.4"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <rect width="0.6" height="1.4" className="fill-away/35" />
        </pattern>
      </defs>
      {layers.space && owners !== null && (
        <g data-testid="space-layer">
          {Array.from(owners, (owner, index) => {
            const col = index % SPACE_COLS;
            const row = Math.floor(index / SPACE_COLS);
            return (
              <rect
                key={index}
                x={-length / 2 + col * cellW}
                y={width / 2 - (row + 1) * cellH}
                width={cellW}
                height={cellH}
                className={owner === 1 ? 'fill-home/20' : undefined}
                fill={owner === 1 ? undefined : 'url(#movement-away-stripes)'}
              />
            );
          })}
        </g>
      )}
      <g className="fill-none stroke-pitch/45" strokeWidth={0.35} strokeLinejoin="round">
        {markings.lines.map((line, i) => (
          <polyline key={i} points={svgPoints(line)} />
        ))}
        {markings.spots.map((spot, i) => (
          <circle key={i} cx={spot.x} cy={-spot.y} r={0.35} className="fill-pitch/45" />
        ))}
      </g>
      {layers.shape &&
        (['home', 'away'] as const).map((side) => {
          const hull = convexHull(outfield(frame, side));
          const shape = side === 'home' ? readout.home : readout.away;
          return (
            <g key={side} data-testid={`shape-${side}`}>
              {hull.length >= 3 && (
                <polygon
                  points={svgPoints(hull)}
                  className={SHAPE_CLASS[side]}
                  strokeWidth={0.45}
                />
              )}
              {shape !== null &&
                (side === 'home' ? (
                  <circle cx={shape.centroidX} cy={-shape.centroidY} r={1} className="fill-home" />
                ) : (
                  <rect
                    x={shape.centroidX - 0.9}
                    y={-shape.centroidY - 0.9}
                    width={1.8}
                    height={1.8}
                    className="fill-away"
                  />
                ))}
            </g>
          );
        })}
      {layers.trail && trail.length > 1 && (
        <polyline
          data-testid="trail-layer"
          points={svgPoints(trail)}
          className="fill-none stroke-ink"
          strokeWidth={0.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {frame.players.map((player) => {
        const name = t('movement.stage.playerLabel', {
          side: club(player.side),
          shirt: player.shirt,
        });
        const choose = () => {
          onSelect(player.slot);
        };
        return (
          <g
            key={player.slot}
            role="button"
            tabIndex={-1}
            aria-label={name}
            aria-pressed={selected === player.slot}
            transform={`translate(${player.x.toFixed(2)} ${(-player.y).toFixed(2)})`}
            onClick={choose}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') choose();
            }}
            className="cursor-pointer"
          >
            {selected === player.slot && (
              <circle r={2.9} className="fill-none stroke-ink" strokeWidth={0.45} />
            )}
            {player.side === 'home' ? (
              <circle r={1.8} className="fill-home stroke-raised" strokeWidth={0.25} />
            ) : (
              <rect
                x={-1.7}
                y={-1.7}
                width={3.4}
                height={3.4}
                rx={0.5}
                className="fill-away stroke-raised"
                strokeWidth={0.25}
              />
            )}
            <text
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={1.9}
              fontWeight={700}
              className="pointer-events-none fill-on-ink tabular-nums"
            >
              {player.shirt}
            </text>
          </g>
        );
      })}
      {frame.ball !== null && (
        <circle
          data-testid="ball"
          cx={frame.ball.x}
          cy={-frame.ball.y}
          r={0.9}
          className="fill-ink stroke-raised"
          strokeWidth={0.3}
        />
      )}
    </svg>
  );
}
