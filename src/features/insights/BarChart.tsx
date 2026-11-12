import { useId } from 'react';

export interface Bar {
  readonly key: string;
  readonly label: string;
  readonly value: number;
  /** The number as the coach should read it, already formatted. */
  readonly valueText: string;
  /** Where a reference mark sits, on the same scale as `value`. */
  readonly reference?: number;
}

export interface BarChartProps {
  readonly bars: readonly Bar[];
  /** Top of the scale. Shared between charts that are meant to be compared. */
  readonly max: number;
  /** Everything the picture says, in words. */
  readonly description: string;
}

const WIDTH = 320;
const PLOT_TOP = 24;
const PLOT_HEIGHT = 96;
const BASELINE = PLOT_TOP + PLOT_HEIGHT;

/**
 * A small column chart in tokens. Every bar carries its own number, so no value is read off an
 * axis, and the whole picture has a text alternative. Dashed marks are reference values.
 */
export function BarChart({ bars, max, description }: BarChartProps) {
  const titleId = useId();
  const slot = WIDTH / Math.max(1, bars.length);
  const barWidth = Math.min(48, slot * 0.55);
  const heightOf = (value: number): number =>
    max > 0 ? Math.min(PLOT_HEIGHT, (Math.max(0, value) / max) * PLOT_HEIGHT) : 0;

  return (
    <svg
      role="img"
      aria-labelledby={titleId}
      viewBox={`0 0 ${String(WIDTH)} ${String(BASELINE + 26)}`}
      className="h-auto w-full max-w-md"
    >
      <title id={titleId}>{description}</title>
      <line x1={0} x2={WIDTH} y1={BASELINE} y2={BASELINE} className="stroke-line" strokeWidth={1} />
      {bars.map((bar, index) => {
        const x = index * slot + (slot - barWidth) / 2;
        const height = heightOf(bar.value);
        const referenceY = bar.reference === undefined ? null : BASELINE - heightOf(bar.reference);
        return (
          <g key={bar.key}>
            {height > 0 && (
              <rect
                x={x}
                y={BASELINE - height}
                width={barWidth}
                height={height}
                rx={3}
                className="fill-home"
              />
            )}
            {referenceY !== null && (
              <line
                x1={x - 5}
                x2={x + barWidth + 5}
                y1={referenceY}
                y2={referenceY}
                className="stroke-ink"
                strokeWidth={2}
                strokeDasharray="4 3"
              />
            )}
            <text
              x={x + barWidth / 2}
              y={BASELINE - Math.max(height, referenceY === null ? 0 : BASELINE - referenceY) - 6}
              textAnchor="middle"
              fontSize={13}
              fontWeight={600}
              className="fill-ink"
            >
              {bar.valueText}
            </text>
            <text
              x={x + barWidth / 2}
              y={BASELINE + 18}
              textAnchor="middle"
              fontSize={13}
              className="fill-ink-soft"
            >
              {bar.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
