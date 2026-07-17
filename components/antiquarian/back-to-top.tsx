'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronUp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { springs } from '@/lib/animations';

const SHOW_AFTER_PX = 600;

/**
 * Floating back-to-top button. The app shell scrolls inside #main-content
 * (not the window), so both the visibility check and the scroll command
 * target that element, falling back to the window outside the shell.
 * M30: it arrives like a bookmark pulled up from the page edge and gives a
 * small upward tug on hover. Sits under the toast stack (z-40 < z-100).
 */
export function BackToTop() {
  const t = useTranslations('common');
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = document.getElementById('main-content');
    const target: HTMLElement | Window = el ?? window;
    const onScroll = () => setVisible((el ? el.scrollTop : window.scrollY) > SHOW_AFTER_PX);
    onScroll();
    target.addEventListener('scroll', onScroll, { passive: true });
    return () => target.removeEventListener('scroll', onScroll);
  }, []);

  const scrollToTop = () => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const el = document.getElementById('main-content');
    (el ?? window).scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          type="button"
          initial={{ opacity: 0, y: 72, rotate: 4 }}
          animate={{ opacity: 1, y: 0, rotate: 0 }}
          exit={{ opacity: 0, y: 72, rotate: 4 }}
          transition={springs.seal}
          whileHover={{ y: -4, rotate: -3 }}
          whileTap={{ scale: 0.9, y: 2 }}
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
