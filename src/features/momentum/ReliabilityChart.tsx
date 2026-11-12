import { useTranslation } from 'react-i18next';
import { formatDecimal, linearScale } from './chartModel';
import { axisCeiling, type ReliabilityBin } from './researchModel';
import { useElementWidth } from './useElementWidth';

const MARGIN = { left: 40, right: 12, top: 12, bottom: 40 } as const;
const STEPS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.8, 1];
const MAX_SIZE = 380;

interface ReliabilityChartProps {
  readonly bins: readonly ReliabilityBin[];
  readonly label: string;
}

/** Predicted against observed goal rate per bin. On the diagonal means well calibrated. */
export function ReliabilityChart({ bins, label }: ReliabilityChartProps) {
  const { t, i18n } = useTranslation();
  const { ref, width } = useElementWidth(MAX_SIZE);
  const size = Math.min(width, MAX_SIZE);
  const ceiling = axisCeiling(
    bins.flatMap((bin) => [bin.predicted, bin.observed]),
    STEPS,
  );
  const x = linearScale([0, ceiling], [MARGIN.left, size - MARGIN.right]);
  const y = linearScale([0, ceiling], [size - MARGIN.bottom, MARGIN.top]);
  const ticks = Array.from({ length: Math.round(ceiling / 0.1) + 1 }, (_, index) => index * 0.1);
  const number = (value: number, digits = 1) => formatDecimal(value, digits, i18n.language);
  const line = bins
    .map(
      (bin, index) =>
        `${index === 0 ? 'M' : 'L'}${String(x(bin.predicted))} ${String(y(bin.observed))}`,
    )
    .join('');

  return (
    <div ref={ref} className="w-full">
      <svg width={size} height={size} role="img" aria-label={label} className="block">
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={x(tick)} x2={x(tick)} y1={y(0)} y2={y(0) + 4} className="stroke-mute" />
            <line x1={x(0) - 4} x2={x(0)} y1={y(tick)} y2={y(tick)} className="stroke-mute" />
            <text
              x={x(tick)}
              y={y(0) + 16}
              textAnchor="middle"
              className="fill-ink-soft text-[11px] tabular-nums"
            >
              {number(tick)}
            </text>
            <text
              x={x(0) - 7}
              y={y(tick) + 4}
              textAnchor="end"
              className="fill-ink-soft text-[11px] tabular-nums"
            >
              {number(tick)}
            </text>
          </g>
        ))}
        <line x1={x(0)} x2={x(ceiling)} y1={y(0)} y2={y(0)} className="stroke-mute" />
        <line x1={x(0)} x2={x(0)} y1={y(0)} y2={y(ceiling)} className="stroke-mute" />
        <line
          x1={x(0)}
          y1={y(0)}
          x2={x(ceiling)}
          y2={y(ceiling)}
          className="stroke-mute"
          strokeDasharray="4 4"
        />
        <text
          x={x(ceiling) - 4}
          y={y(ceiling * 0.6)}
          textAnchor="end"
          className="fill-ink-soft text-[11px]"
        >
          {t('lab.research.diagonal')}
        </text>
        <path d={line} className="fill-none stroke-ink-soft" strokeWidth={1.25} />
        {bins.map((bin) => (
          <circle
            key={bin.predicted}
            cx={x(bin.predicted)}
            cy={y(bin.observed)}
            r={4}
            className="fill-ink stroke-raised"
            strokeWidth={1.5}
          />
        ))}
        <text
          x={(x(0) + x(ceiling)) / 2}
          y={size - 6}
          textAnchor="middle"
          className="fill-ink text-[12px] font-semibold"
        >
          {t('lab.research.predicted')}
        </text>
        <text
          transform={`translate(12 ${String((y(0) + y(ceiling)) / 2)}) rotate(-90)`}
          textAnchor="middle"
          className="fill-ink text-[12px] font-semibold"
        >
          {t('lab.research.observed')}
        </text>
      </svg>
      {/* The wrapper clips: a table ignores the width sr-only sets and would widen the page. */}
      <div className="sr-only">
        <table>
          <caption>{label}</caption>
          <thead>
            <tr>
              <th scope="col">{t('lab.research.binHeader')}</th>
              <th scope="col">{t('lab.research.shotsHeader')}</th>
              <th scope="col">{t('lab.research.predicted')}</th>
              <th scope="col">{t('lab.research.observed')}</th>
            </tr>
          </thead>
          <tbody>
            {bins.map((bin, index) => (
              <tr key={bin.predicted}>
                <th scope="row">{index + 1}</th>
                <td>{bin.n}</td>
                <td>{number(bin.predicted, 3)}</td>
                <td>{number(bin.observed, 3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
