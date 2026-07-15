'use client';

import { useEffect, useRef } from 'react';
import { animate, useReducedMotion } from 'motion/react';

interface AnimatedNumberProps {
  value: number;
  className?: string;
}

/**
 * Counts up to `value` on mount (and rolls to the new value on change) by
 * writing directly to the DOM — no per-frame React renders. Renders the final
 * value as SSR/no-JS fallback and shows it immediately under reduced motion.
 */
export function AnimatedNumber({ value, className }: AnimatedNumberProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const prevRef = useRef(0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
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
    prevRef.current = value;
    return () => controls.stop();
  }, [value, reduceMotion]);

  return (
    <span ref={ref} className={className}>
      {value.toLocaleString()}
    </span>
  );
}
