import { Check, Circle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TrackingRosterEntry } from '../../engine/tracking';
import { Card, CardTitle, SelectField } from '../../ui';
import { useClubName } from './clubs';

export interface Layers {
  readonly shape: boolean;
  readonly space: boolean;
  readonly trail: boolean;
}

export const LAYER_KEYS = ['shape', 'space', 'trail'] as const;

export interface LayerPanelProps {
  readonly layers: Layers;
  readonly onToggle: (key: keyof Layers) => void;
  readonly roster: readonly TrackingRosterEntry[];
  readonly selected: number | null;
  readonly onSelect: (slot: number | null) => void;
}

/** What is drawn over the players, which player is followed, and how the teams differ. */
export function LayerPanel({ layers, onToggle, roster, selected, onSelect }: LayerPanelProps) {
  const { t } = useTranslation();
  const club = useClubName();
  const option = (entry: TrackingRosterEntry) =>
    t('movement.layers.playerOption', {
      side: club(entry.side),
      shirt: entry.shirt,
    });

  return (
    <Card as="section" aria-labelledby="movement-layers-title" className="flex flex-col gap-4">
      <CardTitle>
        <span id="movement-layers-title">{t('movement.layers.title')}</span>
      </CardTitle>
      <ul className="flex flex-col gap-1">
        {LAYER_KEYS.map((key) => (
          <li key={key}>
            {/* A native checkbox with switch semantics: the knob's position, a tick and the
                word on or off carry the state, never the colour alone. */}
            <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-control py-1">
              <span className="min-w-0">
                <span id={`movement-layer-${key}`} className="block font-semibold text-ink">
                  {t(`movement.layers.${key}`)}
                </span>
                <span
                  id={`movement-layer-${key}-detail`}
                  className="block text-[13px] text-ink-soft"
                >
                  {t(`movement.layers.${key}Detail`)}
                </span>
              </span>
              <input
                type="checkbox"
                role="switch"
                checked={layers[key]}
                aria-labelledby={`movement-layer-${key}`}
                aria-describedby={`movement-layer-${key}-detail`}
                onChange={() => {
                  onToggle(key);
                }}
                className="peer sr-only"
              />
              <span
                aria-hidden="true"
                className="flex shrink-0 items-center gap-2 text-[13px] font-semibold text-ink-soft peer-focus-visible:outline-3 peer-focus-visible:outline-pitch"
              >
                {t(layers[key] ? 'movement.layers.on' : 'movement.layers.off')}
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
      <SelectField
        label={t('movement.layers.playerLabel')}
        value={selected === null ? '' : String(selected)}
        options={[
          { value: '', label: t('movement.layers.noPlayer') },
          ...roster.map((entry) => ({ value: String(entry.slot), label: option(entry) })),
        ]}
        onChange={(value) => {
          onSelect(value === '' ? null : Number(value));
        }}
      />
      <div className="flex flex-col gap-1 text-[13px] text-ink-soft">
        <p className="font-semibold text-ink">{t('movement.layers.legendTitle')}</p>
        <p className="flex items-center gap-2">
          <span aria-hidden="true" className="size-3 shrink-0 rounded-full bg-home" />
          {t('movement.layers.legendHome', { club: club('home') })}
        </p>
        <p className="flex items-center gap-2">
          <span aria-hidden="true" className="size-3 shrink-0 rounded-[2px] bg-away" />
          {t('movement.layers.legendAway', { club: club('away') })}
        </p>
        <p className="flex items-center gap-2">
          <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full bg-ink" />
          {t('movement.layers.legendBall')}
        </p>
      </div>
    </Card>
  );
}
