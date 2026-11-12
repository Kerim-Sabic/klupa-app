import { ChevronDown, CircleAlert } from 'lucide-react';
import { useId, type ComponentPropsWithRef, type ReactNode } from 'react';
import { cx } from './internal';

interface FieldText {
  label: string;
  hint?: string;
  error?: string;
}

interface FieldIds {
  control: string;
  hint: string | undefined;
  error: string | undefined;
  describedBy: string | undefined;
}

function useFieldIds(
  { hint, error }: FieldText,
  ownId: string | undefined,
  ownDescribedBy: string | undefined,
): FieldIds {
  const base = useId();
  const hintId = hint === undefined ? undefined : `${base}-hint`;
  const errorId = error === undefined ? undefined : `${base}-error`;
  const describedBy = [hintId, errorId, ownDescribedBy].filter(Boolean).join(' ');
  return {
    control: ownId ?? `${base}-control`,
    hint: hintId,
    error: errorId,
    describedBy: describedBy === '' ? undefined : describedBy,
  };
}

function FieldFrame({
  text,
  ids,
  children,
}: {
  text: FieldText;
  ids: FieldIds;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={ids.control} className="text-[15px] font-semibold text-ink">
        {text.label}
      </label>
      {children}
      {text.hint !== undefined && (
        <p id={ids.hint} className="text-[13px] text-ink-soft">
          {text.hint}
        </p>
      )}
      {text.error !== undefined && (
        <p
          id={ids.error}
          role="alert"
          className="flex items-start gap-1.5 text-[13px] font-semibold text-clay"
        >
          <CircleAlert aria-hidden="true" size={16} className="mt-px shrink-0" />
          {text.error}
        </p>
      )}
    </div>
  );
}

// 16 px text: iOS zooms the whole page into any field set smaller, which loses the coach's place.
const CONTROL = cx(
  'min-h-12 w-full rounded-control border bg-raised px-3.5 text-[16px] text-ink',
  'shadow-[inset_0_1px_2px_rgb(18_22_28/0.05)] transition-[border-color,box-shadow] duration-120 ease-touch',
  'placeholder:text-mute hover:border-mute focus-visible:border-pitch focus-visible:outline-offset-1',
  'disabled:cursor-not-allowed disabled:border-line disabled:bg-mute-soft disabled:text-mute',
);

function borderFor(error: string | undefined): string {
  return error === undefined ? 'border-line' : 'border-clay hover:border-clay';
}

export interface TextFieldProps extends FieldText, ComponentPropsWithRef<'input'> {}

/** A labelled input. Hint and error are wired to the control with `aria-describedby`. */
export function TextField({
  label,
  hint,
  error,
  id,
  className,
  'aria-describedby': ownDescribedBy,
  ...rest
}: TextFieldProps) {
  const text: FieldText = {
    label,
    ...(hint !== undefined && { hint }),
    ...(error !== undefined && { error }),
  };
  const ids = useFieldIds(text, id, ownDescribedBy);
  return (
    <FieldFrame text={text} ids={ids}>
      <input
        {...rest}
        id={ids.control}
        aria-describedby={ids.describedBy}
        aria-invalid={error !== undefined || undefined}
        className={cx(CONTROL, borderFor(error), className)}
      />
    </FieldFrame>
  );
}

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectFieldProps
  extends FieldText, Omit<ComponentPropsWithRef<'select'>, 'value' | 'onChange' | 'children'> {
  options: readonly SelectOption[];
  value: string;
  onChange: (value: string) => void;
}

/** A labelled native select: the phone's own picker is the best one there is. */
export function SelectField({
  label,
  hint,
  error,
  options,
  value,
  onChange,
  id,
  className,
  'aria-describedby': ownDescribedBy,
  ...rest
}: SelectFieldProps) {
  const text: FieldText = {
    label,
    ...(hint !== undefined && { hint }),
    ...(error !== undefined && { error }),
  };
  const ids = useFieldIds(text, id, ownDescribedBy);
  return (
    <FieldFrame text={text} ids={ids}>
      <div className="relative">
        <select
          {...rest}
          id={ids.control}
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
          }}
          aria-describedby={ids.describedBy}
          aria-invalid={error !== undefined || undefined}
          className={cx(
            CONTROL,
            borderFor(error),
            'cursor-pointer appearance-none pr-10',
            className,
          )}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden="true"
          size={18}
          className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-ink-soft"
        />
      </div>
    </FieldFrame>
  );
}
