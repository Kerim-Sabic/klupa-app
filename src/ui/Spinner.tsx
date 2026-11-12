import { LoaderCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cx } from './internal';

/** The bare rotating ring. Decorative: whoever shows it must also say what is loading. */
export function SpinnerGlyph({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <LoaderCircle
      aria-hidden="true"
      size={size}
      strokeWidth={2.25}
      className={cx('shrink-0 animate-spin motion-reduce:animate-none', className)}
    />
  );
}

export interface SpinnerProps {
  /** What is loading, for screen readers. Defaults to the translated "Loading". */
  label?: string;
}

/** A small, calm loading indicator announced as a status. */
export function Spinner({ label }: SpinnerProps) {
  const { t } = useTranslation();
  return (
    <span role="status" className="inline-flex items-center gap-2 text-ink-soft">
      <SpinnerGlyph />
      <span className="sr-only">{label ?? t('ui.loading')}</span>
    </span>
  );
}
