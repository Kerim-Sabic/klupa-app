import { ChevronRight } from 'lucide-react';
import { useRef } from 'react';
import { Link } from 'react-router';
import { RING_TONE, RingArc, useDrawn, type RingTone } from './Ring';
import { PRESS, STAGGER, cx } from './internal';

export interface RingDatum {
  id: string;
  label: string;
  /** Share in [0, 1], or null when nothing has been recorded yet. */
  value: number | null;
  /** The value as words, for example "82%". */
  valueText: string;
  /** One line under the value: what the number counts. */
  detail?: string;
  tone: RingTone;
  /** The screen that explains this measure. */
  to?: string;
}

export interface RingStackProps {
  /** Up to three rings, outermost first. The legend lists them in the same order. */
  rings: readonly RingDatum[];
  /** What the figure shows as a whole; begins the text alternative. */
  title: string;
  /** Diameter of the figure in px. */
  size?: number;
}

const POSITION_GLYPH_RADII = [7.5, 5, 2.5] as const;

/**
 * Which ring a legend row belongs to, drawn as three nested circles with this one's position
 * solid: the legend is readable without telling the colours apart.
 */
function PositionGlyph({ index, tone }: { index: number; tone: RingTone }) {
  return (
    <svg aria-hidden="true" width={18} height={18} viewBox="0 0 18 18" className="shrink-0">
      {POSITION_GLYPH_RADII.map((radius, position) => (
        <circle
          key={radius}
          cx={9}
          cy={9}
          r={radius}
          fill="none"
          strokeWidth={position === index ? 2.4 : 1.2}
          className={position === index ? RING_TONE[tone].arc : 'stroke-mute/45'}
        />
      ))}
    </svg>
  );
}

function LegendRow({ ring, index }: { ring: RingDatum; index: number }) {
  const content = (
    <>
      <PositionGlyph index={index} tone={ring.tone} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-footnote font-semibold text-ink-soft">{ring.label}</span>
        <span className="font-display text-[26px] text-ink tabular-nums">{ring.valueText}</span>
        {ring.detail !== undefined && (
          <span className="text-caption text-pretty text-ink-soft">{ring.detail}</span>
        )}
      </span>
      {ring.to !== undefined && (
        <ChevronRight
          aria-hidden="true"
          size={18}
          strokeWidth={2.4}
          className="shrink-0 self-center text-mute"
        />
      )}
    </>
  );
  const row = 'flex items-start gap-2.5 rounded-control py-1.5';
  return (
    <li>
      {ring.to === undefined ? (
        <div className={row}>{content}</div>
      ) : (
        <Link
          to={ring.to}
          className={cx(row, '-mx-2 px-2 no-underline hover:bg-mute-soft/70', PRESS)}
        >
          {content}
        </Link>
      )}
    </li>
  );
}

/**
 * The three-ring figure: concentric arcs beside a legend that carries every label and value.
 * The arcs sweep in once, one after another; with reduced motion they are simply drawn.
 */
export function RingStack({ rings, title, size = 152 }: RingStackProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { drawn, reduced } = useDrawn(ref);
  const shown = rings.slice(0, 3);
  const thickness = Math.round(size * 0.1);
  const gap = Math.max(2, Math.round(size * 0.022));
  const centre = size / 2;
  const summary = [title, ...shown.map((ring) => `${ring.label}: ${ring.valueText}`)].join('. ');

  return (
    <div ref={ref} className="flex flex-wrap items-center gap-x-5 gap-y-4">
      <svg
        role="img"
        aria-label={summary}
        width={size}
        height={size}
        viewBox={`0 0 ${String(size)} ${String(size)}`}
        className="shrink-0"
      >
        {shown.map((ring, index) => (
          <RingArc
            key={ring.id}
            centre={centre}
            radius={centre - thickness / 2 - index * (thickness + gap)}
            thickness={thickness}
            value={ring.value}
            tone={ring.tone}
            drawn={drawn}
            reduced={reduced}
            delay={index * STAGGER.step * 2}
          />
        ))}
      </svg>
      <ul className="flex min-w-[9.5rem] flex-1 flex-col gap-1">
        {shown.map((ring, index) => (
          <LegendRow key={ring.id} ring={ring} index={index} />
        ))}
      </ul>
    </div>
  );
}
