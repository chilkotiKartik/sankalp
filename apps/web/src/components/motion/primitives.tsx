'use client';

import { cn } from '@sanjeevani/ui';
import { animate, motion, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { GLIDE, calm, page, rise, stagger } from '@/lib/motion';

/**
 * Wraps a screen body so every page arrives the same way. Sits inside the scroll
 * container, not around it, so the sticky header never moves.
 */
export function PageBody({ children, className }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion() ?? false;
  return (
    <motion.div variants={page(reduce)} initial="hidden" animate="shown" className={className}>
      {children}
    </motion.div>
  );
}

/** A section whose direct children reveal one after another. */
export function Stagger({
  children,
  className,
  step,
  as = 'div',
}: {
  children: ReactNode;
  className?: string;
  step?: number;
  as?: 'div' | 'ul' | 'ol' | 'section';
}) {
  const reduce = useReducedMotion() ?? false;
  const Component = motion[as];
  return (
    <Component variants={stagger(reduce, step)} initial="hidden" animate="shown" className={className}>
      {children}
    </Component>
  );
}

/** One member of a Stagger. */
export function StaggerItem({
  children,
  className,
  distance,
  as = 'div',
}: {
  children: ReactNode;
  className?: string;
  distance?: number;
  as?: 'div' | 'li' | 'section' | 'article';
}) {
  const reduce = useReducedMotion() ?? false;
  const Component = motion[as];
  return (
    <Component variants={rise(reduce, distance)} className={className}>
      {children}
    </Component>
  );
}

/**
 * A number that counts to its value when it changes. Distances and travel times
 * feel measured rather than swapped. Always renders the real value as text, so a
 * screen reader and a paused animation both read correctly.
 */
export function AnimatedNumber({
  value,
  decimals = 0,
  className,
}: {
  value: number;
  decimals?: number;
  className?: string;
}) {
  const reduce = useReducedMotion() ?? false;
  const [shown, setShown] = useState(value);
  const previous = useRef(value);

  useEffect(() => {
    const from = previous.current;
    previous.current = value;
    if (reduce || Math.abs(value - from) < 0.05) {
      setShown(value);
      return;
    }
    const controls = animate(from, value, {
      duration: 0.55,
      ease: [0.2, 0.8, 0.2, 1],
      onUpdate: (v) => setShown(v),
    });
    return () => controls.stop();
  }, [value, reduce]);

  return (
    <span className={cn('tabular-nums', className)}>
      {shown.toFixed(decimals)}
    </span>
  );
}

/**
 * Loading placeholder with a sweep instead of a pulse. A pulse reads as "broken";
 * a sweep reads as "working". Falls back to a plain block under reduced motion.
 */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('sv-skeleton rounded-[var(--radius-md)]', className)} />;
}

/** Crossfades between states without the layout jumping as one replaces the other. */
export function Swap({ id, children, className }: { id: string; children: ReactNode; className?: string }) {
  const reduce = useReducedMotion() ?? false;
  return (
    <motion.div
      key={id}
      initial={{ opacity: 0, y: reduce ? 0 : 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: reduce ? 0 : -6 }}
      transition={calm(reduce, GLIDE)}
      className={className}
    >
      {children}
    </motion.div>
  );
}
