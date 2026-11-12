import { animate, motion, useReducedMotionConfig } from 'motion/react';
import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { DURATION, EASE } from './internal';

const RISE = 8;
const STAGGER_MS = 30;
const STAGGER_CAP = 8;

export interface RevealProps {
  /** Delay before the reveal starts, in milliseconds. */
  delay?: number;
  children: ReactNode;
}

/** Fades its content in with an 8 px rise when it mounts. */
export function Reveal({ delay = 0, children }: RevealProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: RISE }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION.base, ease: EASE, delay: delay / 1000 }}
    >
      {children}
    </motion.div>
  );
}

export interface RevealListProps {
  as?: 'ul' | 'ol' | 'div';
  className?: string;
  children: ReactNode;
}

/**
 * Reveals its direct children one after another, 30 ms apart; from the eighth child on they
 * share the last delay so a long list never keeps the coach waiting. Children keep their own
 * elements (an `<li>` stays a direct child of the `<ul>`), so list semantics are untouched.
 */
export function RevealList({ as: Tag = 'div', className, children }: RevealListProps) {
  const node = useRef<HTMLElement | null>(null);
  const reduced = useReducedMotionConfig() === true;

  // Layout effect: hide and start before the first paint so nothing flashes in place first.
  useLayoutEffect(() => {
    const list = node.current;
    if (reduced || list === null) return undefined;
    const items = Array.from(list.children).filter(
      (child): child is HTMLElement => child instanceof HTMLElement,
    );
    const controls = items.map((item, index) =>
      animate(
        item,
        { opacity: [0, 1], transform: [`translateY(${String(RISE)}px)`, 'translateY(0px)'] },
        {
          duration: DURATION.base,
          ease: EASE,
          delay: (Math.min(index, STAGGER_CAP - 1) * STAGGER_MS) / 1000,
        },
      ),
    );
    return () => {
      controls.forEach((control) => {
        control.complete();
      });
    };
    // Runs on mount (and if the motion preference flips): children added later just appear.
  }, [reduced]);

  return (
    <Tag
      ref={(element: HTMLElement | null) => {
        node.current = element;
      }}
      className={className}
    >
      {children}
    </Tag>
  );
}
