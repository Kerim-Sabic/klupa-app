import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Sheet } from '../../ui';
import { formatChance } from './format';
import type { PitchLocation } from './pitch';
import { PitchPicker } from './PitchPicker';
import { eventWeight, type ShotKind } from './weights';

export interface ShotDetails {
  readonly location: PitchLocation | null;
  readonly header: boolean;
  readonly freeKick: boolean;
}

export interface ShotSheetProps {
  readonly open: boolean;
  readonly kind: ShotKind;
  readonly onClose: () => void;
  readonly onSave: (details: ShotDetails) => void;
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-11 flex-1 cursor-pointer items-center gap-3 rounded-control border border-line bg-raised px-3 font-semibold has-[:checked]:border-ink">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => {
          onChange(event.target.checked);
        }}
        className="size-5 accent-[var(--color-ink)]"
      />
      {label}
    </label>
  );
}

/**
 * Where a shot was taken from. Mount it fresh for every shot (the caller keys it), so a new
 * shot never inherits the last one's marker.
 */
export function ShotSheet({ open, kind, onClose, onSave }: ShotSheetProps) {
  const { t, i18n } = useTranslation();
  const noteId = useId();
  const [location, setLocation] = useState<PitchLocation | null>(null);
  const [header, setHeader] = useState(false);
  const [freeKick, setFreeKick] = useState(false);
  const kindLabel = t(`matches.kinds.${kind}`);
  const chance = location === null ? null : eventWeight({ kind, location, header, freeKick });

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('matches.shot.title', { kind: kindLabel })}
      footer={
        <>
          <Button
            variant="secondary"
            onClick={() => {
              onSave({ location: null, header, freeKick });
            }}
          >
            {t('matches.shot.saveWithout')}
          </Button>
          <Button
            disabled={location === null}
            aria-describedby={location === null ? noteId : undefined}
            onClick={() => {
              onSave({ location, header, freeKick });
            }}
          >
            {t('matches.shot.save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <PitchPicker location={location} onChange={setLocation} />
        <div aria-live="polite" id={noteId}>
          {chance === null ? (
            <p className="text-[15px] text-ink-soft">{t('matches.shot.noMarker')}</p>
          ) : (
            <>
              <p className="font-display text-[22px]">
                {t('matches.shot.chance', { value: formatChance(chance, i18n.language) })}
              </p>
              <p className="mt-1 text-[13px] text-ink-soft">{t('matches.shot.estimate')}</p>
            </>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Toggle
            label={t('matches.shot.header')}
            checked={header}
            onChange={(checked) => {
              setHeader(checked);
              // A direct free kick is never a header; keep the pair consistent.
              if (checked) setFreeKick(false);
            }}
          />
          <Toggle
            label={t('matches.shot.freeKick')}
            checked={freeKick}
            onChange={(checked) => {
              setFreeKick(checked);
              if (checked) setHeader(false);
            }}
          />
        </div>
      </div>
    </Sheet>
  );
}
