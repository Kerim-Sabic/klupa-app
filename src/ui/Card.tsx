import type { HTMLAttributes, ReactNode } from 'react';
import { SURFACE, cx } from './internal';

export type CardElement = 'div' | 'section' | 'article' | 'li';

export interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: CardElement;
  /** Inner spacing. Turn off for edge-to-edge content such as a table or a chart. */
  padded?: boolean;
  /** Hover and press affordance for a card that is itself a tap target (via a link inside). */
  interactive?: boolean;
  className?: string;
  children?: ReactNode;
}

/**
 * A raised tile: white on the grey page, or grey on black. It has no border and casts no
 * shadow; only floating things (sheets, toasts) cast `shadow-float`.
 */
export function Card({
  as: Tag = 'div',
  padded = true,
  interactive = false,
  className,
  children,
  ...rest
}: CardProps) {
  return (
    <Tag
      {...rest}
      className={cx(
        'relative rounded-card text-ink',
        SURFACE,
        padded && 'p-4 sm:p-5',
        interactive &&
          'cursor-pointer transition-[transform,box-shadow] duration-200 ease-touch hover:shadow-lift active:scale-[0.985] active:duration-75 has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-pitch',
        className,
      )}
    >
      {children}
    </Tag>
  );
}

export interface CardTitleProps {
  /** Heading level to fit the page outline. Defaults to `h2`. */
  as?: 'h2' | 'h3' | 'h4';
  className?: string;
  children: ReactNode;
}

export function CardTitle({ as: Tag = 'h2', className, children }: CardTitleProps) {
  return <Tag className={cx('text-headline font-semibold text-ink', className)}>{children}</Tag>;
}
