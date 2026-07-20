'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AnimatePresence, motion } from 'motion/react';

/**
 * G5 — the level-up ceremony: when the sidebar detects a level crossing it
 * dispatches `zagafy:level-up`; this shell-level layer stages a brief,
 * non-blocking gold-leaf moment (pointer-events-none, auto-fades).
 */
export function LevelUpCeremony() {
  const t = useTranslations('gamification');
  const [level, setLevel] = useState<number | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onLevelUp = (e: Event) => {
      const detail = (e as CustomEvent<{ level: number }>).detail;
      if (!detail?.level) return;
      setLevel(detail.level);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setLevel(null), 2400);
    };
    window.addEventListener('zagafy:level-up', onLevelUp);
    return () => {
      window.removeEventListener('zagafy:level-up', onLevelUp);
      if (timer) clearTimeout(timer);
    };
  }, []);

  return (
    <AnimatePresence>
      {level !== null && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.5 } }}
          aria-live="polite"
          className="pointer-events-none fixed inset-0 z-[90] flex items-center justify-center"
        >
          <div className="relative">
            {/* rays */}
            <span aria-hidden="true" className="absolute inset-0">
              {Array.from({ length: 12 }, (_, i) => (
                <motion.span
                  key={i}
                  initial={{ opacity: 0.9, rotate: i * 30, scaleX: 0.1 }}
                  animate={{ opacity: 0, rotate: i * 30, scaleX: 2.4 }}
                  transition={{ duration: 1.1, ease: 'easeOut', delay: 0.15 }}
                  className="absolute left-1/2 top-1/2 h-[3px] w-16 origin-left rounded-full bg-brass-400"
                />
              ))}
            </span>
            <motion.div
              initial={{ scale: 1.6, rotate: -5, opacity: 0 }}
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 18 }}
              className="relative rounded-xl border-2 border-brass-500/60 bg-mahogany-900/95 px-8 py-5 text-center shadow-card-hover"
            >
              <p className="label-caps text-[10px] text-brass-400/80">{t('levelUpEyebrow')}</p>
              <p className="gold-leaf mt-1 font-serif text-4xl font-bold">{t('levelUpTitle', { level })}</p>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
