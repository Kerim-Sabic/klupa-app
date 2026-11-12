import { useTranslation } from 'react-i18next';
import { formatPercent, linearScale } from './chartModel';
import { axisCeiling, type CompetitionBar } from './researchModel';
import { useElementWidth } from './useElementWidth';

const ROW = 44;
const TOP = 34;
const PAD_X = 4;
const BAR = 12;
const STEPS = [0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 1];

interface CompetitionChartProps {
  readonly bars: readonly CompetitionBar[];
  /** Pooled share over every match: the reference all bars are read against. */
  readonly pooled: number;
  /** The seven-match pilot's share, drawn as a reference mark. */
  readonly pilot: number;
  readonly label: string;
}

/** Opposed-window share per competition: one bar each, the pilot and the pooled value marked. */
export function CompetitionChart({ bars, pooled, pilot, label }: CompetitionChartProps) {
  const { t, i18n } = useTranslation();
  const { ref, width } = useElementWidth(560);
  const ceiling = axisCeiling([pilot, pooled, ...bars.map((bar) => bar.opposedShare)], STEPS);
  const valueGutter = 48;
  const x = linearScale([0, ceiling], [PAD_X, width - valueGutter]);
  const height = TOP + bars.length * ROW + 8;
  const percent = (share: number) => formatPercent(share, i18n.language, 1);
  const references = [
    {
      key: 'pooled',
      share: pooled,
      text: t('lab.research.pooledMark', { value: percent(pooled) }),
      dash: undefined,
    },
    {
      key: 'pilot',
      share: pilot,
      text: t('lab.research.pilotMark', { value: percent(pilot) }),
      dash: '4 3',
    },
  ];

  return (
    <div ref={ref} className="w-full">
      <svg width={width} height={height} role="img" aria-label={label} className="block">
        {references.map((reference, index) => (
          <g key={reference.key}>
            <line
              x1={x(reference.share)}
              x2={x(reference.share)}
              y1={index === 0 ? 20 : 6}
              y2={height - 4}
              className="stroke-ink"
              strokeWidth={1.25}
              {...(reference.dash !== undefined && { strokeDasharray: reference.dash })}
            />
            <text
              x={x(reference.share) - 4}
              y={index === 0 ? 28 : 14}
              textAnchor="end"
              className="fill-ink text-[11px] font-semibold tabular-nums"
            >
              {reference.text}
            </text>
          </g>
        ))}
        {bars.map((bar, index) => {
          const top = TOP + index * ROW;
          return (
            <g key={bar.key}>
              <text x={PAD_X} y={top + 13} className="fill-ink text-[13px]">
                {t(`lab.competition.${bar.key}`)}
                <tspan className="fill-ink-soft">{` · ${t('lab.research.matchCount', { matches: bar.matches })}`}</tspan>
              </text>
              <rect
                x={x(0)}
                y={top + 20}
                width={Math.max(x(bar.opposedShare) - x(0), 1)}
                height={BAR}
                rx={2}
                className="fill-clay"
              />
              <text
                x={x(bar.opposedShare) + 6}
                y={top + 30}
                className="fill-ink text-[12px] font-semibold tabular-nums"
              >
                {percent(bar.opposedShare)}
              </text>
            </g>
          );
        })}
      </svg>
      {/* The wrapper clips: a table ignores the width sr-only sets and would widen the page. */}
      <div className="sr-only">
        <table>
          <caption>{label}</caption>
          <thead>
            <tr>
              <th scope="col">{t('lab.research.competitionHeader')}</th>
              <th scope="col">{t('lab.research.matchesHeader')}</th>
              <th scope="col">{t('lab.research.opposedHeader')}</th>
            </tr>
          </thead>
          <tbody>
            {bars.map((bar) => (
              <tr key={bar.key}>
                <th scope="row">{t(`lab.competition.${bar.key}`)}</th>
                <td>{bar.matches}</td>
                <td>{percent(bar.opposedShare)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
