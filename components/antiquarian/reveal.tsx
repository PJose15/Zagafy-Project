'use client';

import { motion } from 'motion/react';
import { springs } from '@/lib/animations';

interface RevealProps {
  children: React.ReactNode;
  className?: string;
  /** Extra delay (s) after entering the viewport, for choreographing siblings. */
  delay?: number;
}

/**
 * Scroll-reveal wrapper: fades content up the first time it enters the
 * viewport. For below-the-fold sections so long pages unfold as you scroll
 * instead of everything animating unseen at mount. Respects reduced motion
 * via the shell's MotionConfig.
 */
export function Reveal({ children, className, delay = 0 }: RevealProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -60px 0px' }}
      transition={{ ...springs.gentle, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
