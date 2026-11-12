import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from './internal';

export interface StageProps extends HTMLAttributes<HTMLElement> {
  as?: 'div' | 'header' | 'section' | 'article';
  className?: string;
  children?: ReactNode;
}

/**
 * A black tile for the product's own graphics: a scoreboard, the rings, the 3D replay. It is
 * black in both themes. Everything inside takes its colours from the `stage` utility
 * (index.css), so text, buttons, pills and charts placed on it need no special case.
 */
export function Stage({ as: Tag = 'div', className, children, ...rest }: StageProps) {
  return (
    <Tag {...rest} className={cx('stage rounded-stage shadow-stage', className)}>
      {children}
    </Tag>
  );
}
