'use client';

import { motion } from 'motion/react';
import { fadeUp } from '@/lib/animations';

/**
 * Route-level page-entry transition for the app group. Next.js remounts a
 * template on every navigation (unlike layout), so each page fades up as it
 * arrives instead of hard-swapping. The transform is removed once the spring
 * settles, so `position: fixed` overlays inside pages are unaffected.
 * Reduced-motion users are covered by the MotionConfig in LibraryShell.
 */
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return (
    <motion.div initial={fadeUp.initial} animate={fadeUp.animate} transition={fadeUp.transition}>
      {children}
    </motion.div>
  );
}
