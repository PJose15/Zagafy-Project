'use client';

import { forwardRef, useImperativeHandle, useRef, useState, useEffect } from 'react';

export interface MomentumHandle {
  /** Nudge momentum up on a keystroke. */
  bump: () => void;
}

const DECAY_INTERVAL_MS = 100;
const INCREMENT = 0.02;
const DECAY = 0.01;

/**
 * Ambient "momentum" glow behind the writing surface. It owns its own momentum
 * state and decay interval so the ~10 Hz decay ticks re-render only this small
 * leaf — not the parent editor. The parent bumps momentum imperatively via ref
 * on each keystroke.
 */
export const MomentumGlow = forwardRef<MomentumHandle>(function MomentumGlow(_props, ref) {
  const [momentum, setMomentum] = useState(0);
  const momentumRef = useRef(0);

  useImperativeHandle(ref, () => ({
    bump: () => {
      momentumRef.current = Math.min(1, momentumRef.current + INCREMENT);
      setMomentum(momentumRef.current);
    },
  }), []);

  useEffect(() => {
    const timer = setInterval(() => {
      // Idle: leave state untouched so React bails out and nothing re-renders.
      if (momentumRef.current <= 0) return;
      momentumRef.current = Math.max(0, momentumRef.current - DECAY);
      setMomentum(momentumRef.current);
    }, DECAY_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  return (
    <div
      className="fixed inset-0 pointer-events-none z-0 transition-opacity duration-300"
      style={{ opacity: momentum * 0.3 }}
      aria-hidden="true"
    >
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(ellipse at center, rgba(99, 102, 241, ${momentum * 0.15}) 0%, rgba(139, 92, 246, ${momentum * 0.08}) 40%, transparent 70%)`,
        }}
      />
    </div>
  );
});
