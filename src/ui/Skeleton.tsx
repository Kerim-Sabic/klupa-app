import { cx } from './internal';

const SHIMMER = 'animate-pulse bg-mute-soft motion-reduce:animate-none';

export interface SkeletonProps {
  /** Size and shape. Give it the dimensions of what it stands in for. */
  className?: string;
}

/** A placeholder block with a calm pulse. Hidden from assistive tech; pair with a status. */
export function Skeleton({ className }: SkeletonProps) {
  return (
    <div aria-hidden="true" className={cx('rounded-control', SHIMMER, className ?? 'h-4 w-full')} />
  );
}

export interface SkeletonTextProps {
  lines?: number;
}

/** Lines of placeholder text; the last one is shorter, the way a paragraph ends. */
export function SkeletonText({ lines = 3 }: SkeletonTextProps) {
  const count = Math.max(1, Math.floor(lines));
  return (
    <div aria-hidden="true" className="flex flex-col gap-2.5">
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className={cx(
            'h-3.5 rounded-full',
            SHIMMER,
            index === count - 1 && count > 1 ? 'w-3/5' : 'w-full',
          )}
        />
      ))}
    </div>
  );
}
