import { Check, Circle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardTitle } from '../../ui';
import { css, LAYER_KEYS, markColour, type OverlayLayers } from './draw';
import type { Team } from './teams';
import type { OverlayReading } from './useOverlay';

/** The same ring as on the picture, small, on the dark it is usually seen against. */
function RingKey({ team, colour }: { readonly team: Team; readonly colour: string }) {
  const dash = team === 'a' ? undefined : team === 'b' ? '7 4' : '1.5 4';
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 40 24"
      className="h-6 w-10 shrink-0 rounded-[6px]"
      style={{ background: '#161b20' }}
    >
      <ellipse
        cx="20"
        cy="12"
        rx="13"
        ry="5.5"
        fill="none"
        stroke={colour}
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeDasharray={dash}
      />
    </svg>
  );
}

const ROWS = [
  { team: 'a', label: 'teamA', ring: 'ringA' },
  { team: 'b', label: 'teamB', ring: 'ringB' },
  { team: 'none', label: 'other', ring: 'ringOther' },
] as const;

/** How many of each team are in the picture, with the ring each is drawn with. */
export function CountsCard({ reading }: { readonly reading: OverlayReading }) {
  const { t } = useTranslation();
  const { counts, colours } = reading;
  const total = counts.a + counts.b + counts.none;
  const split = colours.a !== null;
  const rows = split ? ROWS : ROWS.slice(2);

  return (
    <Card as="section" aria-labelledby="overlay-readout-title" className="flex flex-col gap-3">
      <CardTitle as="h2">
        <span id="overlay-readout-title">{t('overlay.readout.title')}</span>
      </CardTitle>
      <dl className="flex flex-col gap-2" data-testid="overlay-counts">
        {rows.map((row) => (
          <div key={row.team} className="flex items-center gap-3">
            <RingKey team={row.team} colour={css(markColour(row.team, colours))} />
            <dt className="min-w-0 flex-1 text-[15px] text-ink">
              {t(split ? `overlay.readout.${row.label}` : 'overlay.readout.everyone')}
              <span className="block text-[13px] text-ink-soft">
                {t(`overlay.readout.${row.ring}`)}
              </span>
            </dt>
            <dd className="font-display text-[22px] text-ink tabular-nums">{counts[row.team]}</dd>
          </div>
        ))}
      </dl>
      {total === 0 && <p className="text-[13px] text-ink-soft">{t('overlay.readout.waiting')}</p>}
      {!split && total >= 2 && (
        <p className="text-[13px] text-ink-soft">{t('overlay.readout.cannotSplit')}</p>
      )}
    </Card>
  );
}

export interface LayersCardProps {
  readonly layers: OverlayLayers;
  readonly onToggle: (key: keyof OverlayLayers) => void;
}

/** What is drawn over the picture. Each layer can be switched off. */
export function LayersCard({ layers, onToggle }: LayersCardProps) {
  const { t } = useTranslation();
  return (
    <Card as="section" aria-labelledby="overlay-layers-title" className="flex flex-col gap-2">
      <CardTitle as="h2">
        <span id="overlay-layers-title">{t('overlay.layers.title')}</span>
      </CardTitle>
      <ul className="flex flex-col gap-1">
        {LAYER_KEYS.map((key) => (
          <li key={key}>
            {/* A native checkbox with switch semantics: the knob's position, a tick and the
                word on or off carry the state, never the colour alone. */}
            <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-control py-1">
              <span className="min-w-0">
                <span id={`overlay-layer-${key}`} className="block font-semibold text-ink">
                  {t(`overlay.layers.${key}`)}
                </span>
                <span
                  id={`overlay-layer-${key}-detail`}
                  className="block text-[13px] text-ink-soft"
                >
                  {t(`overlay.layers.${key}Detail`)}
                </span>
              </span>
              <input
                type="checkbox"
                role="switch"
                checked={layers[key]}
                aria-labelledby={`overlay-layer-${key}`}
                aria-describedby={`overlay-layer-${key}-detail`}
                onChange={() => {
                  onToggle(key);
                }}
                className="peer sr-only"
              />
              <span
                aria-hidden="true"
                className="flex shrink-0 items-center gap-2 text-[13px] font-semibold text-ink-soft peer-focus-visible:outline-3 peer-focus-visible:outline-pitch"
              >
                {t(layers[key] ? 'overlay.layers.on' : 'overlay.layers.off')}
                <span
                  className={`flex h-7 w-12 items-center rounded-full p-0.5 ${layers[key] ? 'justify-end bg-pitch' : 'justify-start bg-mute-soft'}`}
                >
                  <span className="grid size-6 place-items-center rounded-full bg-raised text-ink shadow-card [&>svg]:size-3.5">
                    {layers[key] ? <Check strokeWidth={3} /> : <Circle strokeWidth={2} />}
                  </span>
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>
    </Card>
  );
}
