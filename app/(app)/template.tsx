'use client';

import { motion } from 'motion/react';

/**
 * Route-level page-entry transition for the app group. Next.js remounts a
 * template on every navigation (unlike layout), so each page fades in as it
 * arrives instead of hard-swapping. Opacity only — a transform here would
 * create a containing block for `position: fixed` children while animating,
 * shifting full-screen overlays (flow editor, chapter select) mid-entry.
 * Reduced-motion users are covered by the MotionConfig in LibraryShell.
 */
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  );
}
