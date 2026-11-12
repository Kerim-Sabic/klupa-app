import { motion } from 'motion/react';
import { useId, useRef, type KeyboardEvent } from 'react';
import { SPRING, cx } from './internal';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedProps<T extends string> {
  label: string;
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  /** Keep the label for screen readers but do not draw it, where the choices explain themselves. */
  hideLabel?: boolean;
}

const STEP: Partial<Record<string, number>> = {
  ArrowRight: 1,
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowUp: -1,
};

/**
 * A small set of mutually exclusive choices. Radio-group semantics: one tab stop,
 * arrow keys move and select, Home and End jump to the ends. The thumb slides to the choice.
 */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled = false,
  hideLabel = false,
}: SegmentedProps<T>) {
  const id = useId();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const selectedIndex = options.findIndex((option) => option.value === value);
  // With no match the first option takes the tab stop, so the group stays reachable.
  const tabStop = selectedIndex === -1 ? 0 : selectedIndex;

  function select(index: number) {
    const option = options[index];
    if (option === undefined) return;
    buttons.current[index]?.focus();
    if (option.value !== value) onChange(option.value);
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = options.length - 1;
    const step = STEP[event.key];
    let next: number | null = null;
    if (step !== undefined) next = (index + step + options.length) % options.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = last;
    if (next === null) return;
    event.preventDefault();
    select(next);
  }

  return (
    <div className={cx('flex flex-col', !hideLabel && 'gap-1.5')}>
      <span
        id={`${id}-label`}
        className={hideLabel ? 'sr-only' : 'text-[13px] font-semibold text-ink-soft'}
      >
        {label}
      </span>
      <div
        role="radiogroup"
        aria-labelledby={`${id}-label`}
        aria-disabled={disabled || undefined}
        className="grid auto-cols-fr grid-flow-col gap-0.5 rounded-control bg-mute-soft p-0.5"
      >
        {options.map((option, index) => {
          const checked = option.value === value;
          return (
            <button
              key={option.value}
              ref={(node) => {
                buttons.current[index] = node;
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={index === tabStop ? 0 : -1}
              disabled={disabled}
              onClick={() => {
                select(index);
              }}
              onKeyDown={(event) => {
                onKeyDown(event, index);
              }}
              className={cx(
                'relative min-h-11 rounded-[9px] px-3 text-[15px] font-semibold text-balance',
                'transition-[color,transform] duration-120 ease-touch active:scale-[0.96]',
                'disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100',
                checked ? 'text-ink' : 'text-ink-soft hover:text-ink',
              )}
            >
              {checked && (
                <motion.span
                  aria-hidden="true"
                  layoutId={`${id}-thumb`}
                  transition={SPRING.snappy}
                  className="absolute inset-0 rounded-[9px] bg-raised shadow-[0_1px_2px_rgb(18_22_28/0.12),0_2px_8px_-2px_rgb(18_22_28/0.12)] ring-1 ring-hairline"
                />
              )}
              <span className="relative">{option.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
