import { Check, Minus, Plus } from 'lucide-react';

/** Join class names, skipping anything falsy. */
export function cx(...parts: readonly (string | false | null | undefined)[]): string {
  return parts.filter((part): part is string => typeof part === 'string' && part !== '').join(' ');
}

const PRESS =
  'transition-[transform,background-color,border-color,color,opacity] duration-120 ease-touch active:scale-[0.96] disabled:active:scale-100';

export interface StepperProps {
  /** Visible name of the number. */
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step?: number;
  readonly onChange: (value: number) => void;
  /** Full accessible names for the two buttons, so each row says whose number it changes. */
  readonly decreaseLabel: string;
  readonly increaseLabel: string;
  readonly size?: 'md' | 'lg';
  readonly suffix?: string;
}

/**
 * A number changed with two big buttons: the way to count on a pitch with one thumb.
 * The value is an `<output>`, which screen readers announce when it changes.
 */
export function Stepper({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  decreaseLabel,
  increaseLabel,
  size = 'md',
  suffix,
}: StepperProps) {
  const button = cx(
    'grid shrink-0 place-items-center rounded-control border border-line bg-raised text-ink',
    'hover:border-mute hover:bg-mute-soft disabled:cursor-not-allowed disabled:opacity-40',
    PRESS,
    size === 'lg' ? 'size-14' : 'size-11',
  );
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[13px] font-semibold text-ink-soft">{label}</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={decreaseLabel}
          disabled={value <= min}
          onClick={() => {
            onChange(Math.max(min, value - step));
          }}
          className={button}
        >
          <Minus aria-hidden="true" size={size === 'lg' ? 24 : 20} strokeWidth={2.25} />
        </button>
        <output
          className={cx(
            'min-w-[3ch] text-center font-display tabular-nums text-ink',
            size === 'lg' ? 'text-[30px]' : 'text-[22px]',
          )}
        >
          {String(value)}
          {suffix !== undefined && (
            <span className="ml-0.5 text-[13px] font-semibold text-ink-soft">{suffix}</span>
          )}
        </output>
        <button
          type="button"
          aria-label={increaseLabel}
          disabled={value >= max}
          onClick={() => {
            onChange(Math.min(max, value + step));
          }}
          className={button}
        >
          <Plus aria-hidden="true" size={size === 'lg' ? 24 : 20} strokeWidth={2.25} />
        </button>
      </div>
    </div>
  );
}

export interface ToggleChipProps {
  readonly label: string;
  readonly pressed: boolean;
  readonly onToggle: () => void;
}

/** An on/off choice. The tick, not just the tint, says it is on. */
export function ToggleChip({ label, pressed, onToggle }: ToggleChipProps) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onToggle}
      className={cx(
        'inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-[15px] font-semibold',
        PRESS,
        pressed
          ? 'border-ink bg-ink text-on-ink'
          : 'border-line bg-raised text-ink-soft hover:border-mute hover:text-ink',
      )}
    >
      {pressed && <Check aria-hidden="true" size={16} strokeWidth={2.75} />}
      {label}
    </button>
  );
}
