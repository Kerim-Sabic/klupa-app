import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { momentAt, type Goal, type MatchClock, type Pair, type RaceStep } from '../../engine/pro';
import { formatXg, linearScale, niceCeiling, stepLinePath } from '../momentum/chartModel';
import { useElementWidth } from '../momentum/useElementWidth';
import { Card } from '../../ui';
import { raceValueAt } from './view';

const HEIGHT = 220;
const PAD = { left: 12, right: 44, top: 16, bottom: 30 } as const;
const LINE = ['stroke-home', 'stroke-away'] as const;
const DOT = ['fill-home', 'fill-away'] as const;

interface RaceChartProps {
  readonly race: readonly RaceStep[];
  readonly clock: MatchClock;
  /** The playhead: the race is drawn up to it and the rest of the match is left empty. */
  readonly playhead: number;
  readonly goals: readonly Goal[];
  /** Both full-match totals, so the scale holds still while a replay grows. */
  readonly ceilingUnits: number;
  readonly names: Pair<string>;
}

/**
 * Chance quality piling up: both teams' running totals as step lines across the whole match,
 * goals marked on the scorer's line, the breaks between periods ruled. A cursor (drag, or the
 * slider below) reads both totals at any moment that has been played.
 */
export function RaceChart({ race, clock, playhead, goals, ceilingUnits, names }: RaceChartProps) {
  const { t, i18n } = useTranslation();
  const id = useId();
  const { ref, width } = useElementWidth(640);
  const [cursor, setCursor] = useState<number | null>(null);
  const end = Math.min(playhead, clock.total);
  const at = cursor === null ? end : Math.min(cursor, end);
  const x = linearScale([0, Math.max(clock.total, 1)], [PAD.left, width - PAD.right]);
  const ceiling = niceCeiling(Math.max(ceilingUnits, 5000));
  const y = linearScale([0, ceiling], [HEIGHT - PAD.bottom, PAD.top]);
  const value = raceValueAt(race, at);
  const final = raceValueAt(race, end);
  const minute = momentAt(clock, at).minute.label;
  const line = (team: 0 | 1) =>
    stepLinePath(
      race.map((step) => ({ x: x(step.elapsed), y: y(step.units[team]) })),
      x(end),
    );

  const scrubTo = (clientX: number, rect: DOMRect) => {
    const share = (clientX - rect.left - PAD.left) / Math.max(rect.width - PAD.left - PAD.right, 1);
    setCursor(Math.round(Math.min(Math.max(share, 0), 1) * clock.total));
  };

  return (
    <Card padded={false} className="px-2 pt-3 pb-4 sm:px-4">
      <p
        className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-2 tabular-nums"
        aria-live="off"
      >
        <span className="font-display text-[22px] text-ink">{`${minute}'`}</span>
        <span className="font-semibold text-home">{`${names[0]} ${formatXg(value[0], i18n.language)}`}</span>
        <span className="font-semibold text-away">{`${names[1]} ${formatXg(value[1], i18n.language)}`}</span>
      </p>
      <div ref={ref} className="mt-2 w-full">
        <svg
          width={width}
          height={HEIGHT}
          viewBox={`0 0 ${String(width)} ${String(HEIGHT)}`}
          role="img"
          aria-label={t('pro.race.label', {
            home: names[0],
            away: names[1],
            homeValue: formatXg(final[0], i18n.language),
            awayValue: formatXg(final[1], i18n.language),
            minute: momentAt(clock, end).minute.label,
          })}
          className="block cursor-ew-resize touch-pan-y select-none"
          onPointerDown={(event) => {
            scrubTo(event.clientX, event.currentTarget.getBoundingClientRect());
          }}
          onPointerMove={(event) => {
            if (event.buttons === 1)
              scrubTo(event.clientX, event.currentTarget.getBoundingClientRect());
          }}
        >
          {[0.5, 1].map((share) => (
            <g key={share}>
              <line
                x1={PAD.left}
                x2={width - PAD.right}
                y1={y(ceiling * share)}
                y2={y(ceiling * share)}
                className="stroke-line"
                strokeDasharray="2 4"
              />
              <text
                x={width - PAD.right + 6}
                y={y(ceiling * share) + 4}
                className="fill-ink-soft text-[11px]"
              >
                {formatXg(ceiling * share, i18n.language)}
              </text>
            </g>
          ))}
          <line x1={PAD.left} x2={width - PAD.right} y1={y(0)} y2={y(0)} className="stroke-mute" />
          {clock.spans.map((span) => (
            <g key={span.period}>
              {span.from > 0 && (
                <line
                  x1={x(span.from)}
                  x2={x(span.from)}
                  y1={PAD.top - 6}
                  y2={y(0)}
                  className="stroke-mute"
                  strokeDasharray="3 3"
                />
              )}
              <text
                x={x(span.from) + 2}
                y={HEIGHT - 10}
                className="fill-ink-soft text-[11px] tabular-nums"
              >
                {`${String(span.startMinute)}'`}
              </text>
            </g>
          ))}
          {end < clock.total && (
            <rect
              x={x(end)}
              y={PAD.top - 6}
              width={Math.max(x(clock.total) - x(end), 0)}
              height={y(0) - PAD.top + 6}
              className="fill-mute-soft/50"
            />
          )}
          {([0, 1] as const).map((team) => (
            <path
              key={team}
              d={line(team)}
              className={`fill-none ${LINE[team]}`}
              strokeWidth={2.5}
              strokeLinejoin="round"
            />
          ))}
          {goals.map((goal) => {
            const elapsed = (clock.spans.find((s) => s.period === goal.period)?.from ?? 0) + goal.t;
            return (
              <circle
                key={goal.index}
                cx={x(elapsed)}
                cy={y(raceValueAt(race, elapsed)[goal.team])}
                r={5}
                className={`${DOT[goal.team]} stroke-raised`}
                strokeWidth={2}
              />
            );
          })}
          <line
            x1={x(at)}
            x2={x(at)}
            y1={PAD.top - 6}
            y2={y(0)}
            className="stroke-ink"
            strokeWidth={1.5}
            pointerEvents="none"
          />
        </svg>
      </div>
      <label htmlFor={`${id}-cursor`} className="mt-2 flex flex-col gap-1 px-2">
        <span className="text-[13px] font-semibold text-ink-soft">{t('pro.race.cursor')}</span>
        <input
          id={`${id}-cursor`}
          type="range"
          min={0}
          max={Math.max(Math.round(end), 1)}
          value={Math.round(at)}
          aria-valuetext={t('pro.race.cursorValue', {
            minute,
            home: names[0],
            away: names[1],
            homeValue: formatXg(value[0], i18n.language),
            awayValue: formatXg(value[1], i18n.language),
          })}
          onChange={(event) => {
            setCursor(Number(event.target.value));
          }}
          className="min-h-11 w-full accent-ink"
        />
      </label>
      <details className="mt-1 px-2 text-footnote text-ink-soft">
        <summary className="min-h-11 cursor-pointer py-3 font-semibold text-ink">
          {t('pro.race.table')}
        </summary>
        <table className="w-full tabular-nums">
          <thead>
            <tr>
              <th scope="col" className="text-left">
                {t('pro.race.col.minute')}
              </th>
              <th scope="col" className="text-left">
                {t('pro.race.col.team')}
              </th>
              <th scope="col" className="text-right">
                {t('pro.race.col.chance')}
              </th>
              <th scope="col" className="text-right">
                {names[0]}
              </th>
              <th scope="col" className="text-right">
                {names[1]}
              </th>
            </tr>
          </thead>
          <tbody>
            {race.flatMap((step) =>
              step.shot === null
                ? []
                : [
                    <tr key={step.shot.index} className="border-t border-hairline">
                      <td className="py-1">{`${momentAt(clock, step.elapsed).minute.label}'`}</td>
                      <td>{`${names[step.shot.team]}${step.shot.goal ? ` · ${t('pro.goal.flash')}` : ''}`}</td>
                      <td className="text-right">{formatXg(step.shot.units, i18n.language)}</td>
                      <td className="text-right">{formatXg(step.units[0], i18n.language)}</td>
                      <td className="text-right">{formatXg(step.units[1], i18n.language)}</td>
                    </tr>,
                  ],
            )}
          </tbody>
        </table>
      </details>
    </Card>
  );
}
