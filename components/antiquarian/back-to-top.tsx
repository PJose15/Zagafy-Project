'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronUp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { springs } from '@/lib/animations';

const SHOW_AFTER_PX = 600;

/**
 * Floating back-to-top button: springs in once you've scrolled a screen or so,
 * glides the page back to the top. Sits under the toast stack (z-40 < z-100).
 */
export function BackToTop() {
  const t = useTranslations('common');
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > SHOW_AFTER_PX);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const scrollToTop = () => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          type="button"
          initial={{ opacity: 0, scale: 0.6, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.6, y: 16 }}
          transition={springs.seal}
          whileHover={{ y: -3 }}
          whileTap={{ scale: 0.9 }}
          onClick={scrollToTop}
          aria-label={t('backToTop')}
          className="fixed bottom-6 right-6 z-40 w-11 h-11 rounded-full bg-gradient-to-b from-brass-500 to-brass-700 text-cream-50 shadow-lg border border-brass-400/40 flex items-center justify-center"
        >
          <ChevronUp size={20} aria-hidden="true" />
        </motion.button>
      )}
    </AnimatePresence>
  );
}
