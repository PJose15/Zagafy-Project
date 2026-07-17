'use client';

import { useEffect, useRef } from 'react';
import { animate, useReducedMotion } from 'motion/react';

interface AnimatedNumberProps {
  value: number;
  className?: string;
  /** M10: give the number a tiny scale tick when it changes after mount —
      the ledger updating itself. Requires a transform-able display
      (inline-block is applied automatically). */
  pulseOnChange?: boolean;
}

/**
 * Counts up to `value` on mount (and rolls to the new value on change) by
 * writing directly to the DOM — no per-frame React renders. Renders the final
 * value as SSR/no-JS fallback and shows it immediately under reduced motion.
 */
export function AnimatedNumber({ value, className, pulseOnChange = false }: AnimatedNumberProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const prevRef = useRef(0);
  const mountedRef = useRef(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const isUpdate = mountedRef.current && prevRef.current !== value;
    mountedRef.current = true;
    if (reduceMotion) {
      prevRef.current = value;
      el.textContent = value.toLocaleString();
      return;
    }
    const controls = animate(prevRef.current, value, {
      duration: 0.9,
      ease: 'easeOut',
      onUpdate: (v) => {
        el.textContent = Math.round(v).toLocaleString();
      },
    });
    const pulse = pulseOnChange && isUpdate
      ? animate(el, { scale: [1, 1.12, 1] }, { duration: 0.4, ease: 'easeOut' })
      : undefined;
    prevRef.current = value;
    return () => {
      controls.stop();
      pulse?.stop();
    };
  }, [value, reduceMotion, pulseOnChange]);

  return (
    <span ref={ref} className={`${pulseOnChange ? 'inline-block ' : ''}${className ?? ''}`}>
      {value.toLocaleString()}
    </span>
  );
}
