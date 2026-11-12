import { useTranslation } from 'react-i18next';
import { EQUIPMENT, FOCUS_KEYS, PITCH_AREAS } from '../../data/drills';
import { Card, CardTitle, Segmented, SelectField, TextField } from '../../ui';
import {
  DURATIONS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  toggleEquipment,
  type FormErrors,
  type PlannerForm,
} from './constraints';
import { Stepper, ToggleChip } from './controls';

export interface PlannerFieldsProps {
  readonly form: PlannerForm;
  readonly errors: FormErrors;
  readonly onChange: (patch: Partial<PlannerForm>) => void;
}

/** Everything the coach sets before the plan appears; each change re-plans at once. */
export function PlannerFields({ form, errors, onChange }: PlannerFieldsProps) {
  const { t } = useTranslation();
  const error = (code: string | undefined) =>
    code === undefined ? undefined : t(`sessions.formError.${code}`);
  const playersError = error(errors.players);
  const dateError = error(errors.heldOn);

  return (
    <Card as="section" aria-labelledby="planner-setup" className="flex flex-col gap-5">
      <CardTitle>
        <span id="planner-setup">{t('sessions.planner.setup')}</span>
      </CardTitle>
      <SelectField
        label={t('sessions.planner.focus')}
        value={form.focus}
        options={FOCUS_KEYS.map((key) => ({ value: key, label: t(`sessions.focus.${key}`) }))}
        onChange={(value) => {
          const focus = FOCUS_KEYS.find((key) => key === value);
          if (focus !== undefined) onChange({ focus });
        }}
      />
      <TextField
        label={t('sessions.planner.date')}
        type="date"
        value={form.heldOn}
        required
        onChange={(event) => {
          onChange({ heldOn: event.target.value });
        }}
        {...(dateError !== undefined && { error: dateError })}
      />
      <div className="flex flex-col gap-1.5">
        <Stepper
          label={t('sessions.planner.players')}
          value={form.players}
          min={MIN_PLAYERS}
          max={MAX_PLAYERS}
          decreaseLabel={t('sessions.planner.playersLess')}
          increaseLabel={t('sessions.planner.playersMore')}
          onChange={(players) => {
            onChange({ players });
          }}
        />
        {playersError !== undefined && (
          <p role="alert" className="text-[13px] font-semibold text-clay">
            {playersError}
          </p>
        )}
      </div>
      <Segmented
        label={t('sessions.planner.duration')}
        value={String(form.minutes)}
        options={DURATIONS.map((minutes) => ({
          value: String(minutes),
          label: t('sessions.planner.minutesShort', { minutes }),
        }))}
        onChange={(value) => {
          const minutes = DURATIONS.find((option) => String(option) === value);
          if (minutes !== undefined) onChange({ minutes });
        }}
      />
      <Segmented
        label={t('sessions.planner.area')}
        value={form.area}
        options={PITCH_AREAS.map((area) => ({ value: area, label: t(`sessions.area.${area}`) }))}
        onChange={(area) => {
          onChange({ area });
        }}
      />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-[13px] font-semibold text-ink-soft">
          {t('sessions.planner.equipment')}
        </legend>
        <div className="flex flex-wrap gap-2">
          {EQUIPMENT.map((item) => (
            <ToggleChip
              key={item}
              label={t(`sessions.equipment.${item}`)}
              pressed={form.equipment.includes(item)}
              onToggle={() => {
                onChange({ equipment: toggleEquipment(form.equipment, item) });
              }}
            />
          ))}
        </div>
      </fieldset>
      <div>
        <ToggleChip
          label={t('sessions.planner.floodlit')}
          pressed={form.floodlit}
          onToggle={() => {
            onChange({ floodlit: !form.floodlit });
          }}
        />
      </div>
    </Card>
  );
}
