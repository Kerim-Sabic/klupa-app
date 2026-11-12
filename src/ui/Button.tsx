import type { ComponentPropsWithRef, ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router';
import { PRESS, cx } from './internal';
import { SpinnerGlyph } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'tinted' | 'ghost' | 'danger';
export type ButtonSize = 'md' | 'lg';

interface ButtonLook {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  fullWidth?: boolean;
}

export interface ButtonProps extends ButtonLook, ComponentPropsWithRef<'button'> {
  loading?: boolean;
}

export interface LinkButtonProps extends ButtonLook, Omit<LinkProps, 'to'> {
  to: string;
}

// Ink is the primary action and a grey pill the secondary one: colour is kept for meaning.
// `tinted` is the quiet brand action: pitch-soft with ink text, AA in both themes.
const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-ink text-on-ink hover:bg-ink/85',
  secondary: 'bg-mute-soft text-ink hover:bg-line',
  tinted: 'bg-pitch-soft text-ink hover:bg-pitch-soft/70',
  ghost: 'text-ink hover:bg-mute-soft',
  danger: 'bg-clay text-on-ink hover:bg-clay/90',
};

const SIZE: Record<ButtonSize, string> = {
  md: 'min-h-11 px-5 text-[15px] tracking-[-0.01em]',
  lg: 'min-h-13 px-7 text-[17px] tracking-[-0.015em]',
};

function buttonClasses(variant: ButtonVariant, size: ButtonSize, fullWidth: boolean) {
  return cx(
    'inline-flex select-none items-center justify-center gap-2 rounded-full font-semibold leading-tight text-center text-balance',
    'focus-visible:outline-offset-3',
    'disabled:cursor-not-allowed disabled:not-aria-busy:opacity-40 aria-busy:cursor-progress',
    PRESS,
    VARIANT[variant],
    SIZE[size],
    fullWidth && 'w-full',
  );
}

function Icon({ children }: { children: ReactNode }) {
  return (
    <span aria-hidden="true" className="inline-flex shrink-0 [&>svg]:size-[1.15em]">
      {children}
    </span>
  );
}

/** The one button. `loading` keeps the label in place, shows a spinner and blocks repeat taps. */
export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  fullWidth = false,
  type = 'button',
  disabled,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      disabled={disabled === true || loading}
      aria-busy={loading || undefined}
      className={cx(buttonClasses(variant, size, fullWidth), className)}
    >
      {loading ? <SpinnerGlyph size={18} /> : icon !== undefined && <Icon>{icon}</Icon>}
      {children}
    </button>
  );
}

/** Navigation that looks like a button. Renders a react-router `Link`. */
export function LinkButton({
  variant = 'primary',
  size = 'md',
  icon,
  fullWidth = false,
  className,
  children,
  ...rest
}: LinkButtonProps) {
  return (
    <Link
      {...rest}
      className={cx(buttonClasses(variant, size, fullWidth), 'no-underline', className)}
    >
      {icon !== undefined && <Icon>{icon}</Icon>}
      {children}
    </Link>
  );
}
