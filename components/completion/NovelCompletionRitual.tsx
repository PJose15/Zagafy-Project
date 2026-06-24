'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslations } from 'next-intl';
import type { NovelCompletionStats } from '@/lib/gamification/finishing-engine';
import { springs, stampSlam, fadeUp } from '@/lib/animations';
import NovelShareCard, { generateShareCardPNG } from './NovelShareCard';

// ─── CountUp Component ───

function CountUp({ end, duration = 2000 }: { end: number; duration?: number }) {
  const [value, setValue] = useState(0);
  const startTime = useRef<number | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (end === 0) {
      // Use rAF to avoid synchronous setState in effect body
      rafRef.current = requestAnimationFrame(() => setValue(0));
      return () => cancelAnimationFrame(rafRef.current);
    }

    startTime.current = null;

    function step(timestamp: number) {
      if (!startTime.current) startTime.current = timestamp;
      const elapsed = timestamp - startTime.current;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(eased * end));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(step);
      }
    }

    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [end, duration]);

  return <>{value.toLocaleString()}</>;
}

// ─── Act timings (ms) ───

const ACT_DURATIONS = [3000, 4000, 3000, 5000]; // Acts 1-4; Act 5 stays

// ─── Props ───

interface NovelCompletionRitualProps {
  stats: NovelCompletionStats;
  onDismiss: () => void;
}

export default function NovelCompletionRitual({ stats, onDismiss }: NovelCompletionRitualProps) {
  const t = useTranslations('novelCompletion');
  const writerQuotes = useMemo(
    () => [1, 2, 3, 4, 5].map(i => ({ text: t(`quotes.q${i}.text`), author: t(`quotes.q${i}.author`) })),
    [t]
  );
  const [act, setAct] = useState(1);
  const cardRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  // Auto-advance acts
  useEffect(() => {
    if (act >= 5) return;
    const timer = setTimeout(() => setAct((a) => a + 1), ACT_DURATIONS[act - 1]);
    return () => clearTimeout(timer);
  }, [act]);

  // Block Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') e.preventDefault();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Random quote index (stable per mount); resolve against the localized list
  const [quoteIndex] = useState(() => Math.floor(Math.random() * 5));
  const quote = writerQuotes[quoteIndex];

  const handleDownload = useCallback(async () => {
    if (!cardRef.current || downloading) return;
    setDownloading(true);
    try {
      const blob = await generateShareCardPNG(cardRef.current);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${stats.title.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ ]/g, '')}_zagafy.png`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // Silently fail — user can screenshot
    } finally {
      setDownloading(false);
    }
  }, [stats.title, downloading]);

  const handleShare = useCallback(async () => {
    if (!cardRef.current) return;
    try {
      const blob = await generateShareCardPNG(cardRef.current);
      const file = new File([blob], 'zagafy_novel.png', { type: 'image/png' });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: stats.title, text: t('shareText') });
      } else {
        // Fallback to download
        await handleDownload();
      }
    } catch {
      // User cancelled share or unsupported
    }
  }, [stats.title, handleDownload, t]);

  const statItems = [
    { label: t('statWords'), value: stats.totalWords },
    { label: t('statChapters'), value: stats.totalChapters },
    { label: t('statSessions'), value: stats.totalSessions },
    { label: t('statDays'), value: stats.totalDays },
    { label: t('statHours'), value: stats.totalHoursWriting },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('aria')}
      className="fixed inset-0 z-[9999] bg-black flex items-center justify-center overflow-hidden"
    >
      <AnimatePresence mode="wait">
        {/* ── Act 1: Title Fade In ── */}
        {act === 1 && (
          <motion.div
            key="act1"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ ...springs.tome, duration: 1.5 }}
            className="text-center px-8"
          >
            <h1 className="font-serif text-4xl md:text-6xl text-[#c49b48] leading-tight max-w-2xl">
              {stats.title}
            </h1>
          </motion.div>
        )}

        {/* ── Act 2: Stats Counter ── */}
        {act === 2 && (
          <motion.div
            key="act2"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={springs.gentle}
            className="text-center px-8"
          >
            <div className="flex flex-wrap justify-center gap-8 md:gap-12">
              {statItems.map((item, i) => (
                <motion.div
                  key={item.label}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...springs.gentle, delay: i * 0.3 }}
                  className="text-center"
                >
                  <div className="text-3xl md:text-5xl font-serif text-[#c49b48] font-bold">
                    <CountUp end={item.value} />
                  </div>
                  <div className="text-sm text-[#f0dfc0]/50 mt-1">{item.label}</div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {/* ── Act 3: Writer Quote ── */}
        {act === 3 && (
          <motion.div
            key="act3"
            {...fadeUp}
            className="text-center px-8 max-w-xl"
          >
            <p className="font-serif text-xl md:text-2xl text-[#f0dfc0]/80 italic leading-relaxed">
              &ldquo;{quote.text}&rdquo;
            </p>
            <p className="text-sm text-[#c49b48]/60 mt-4">— {quote.author}</p>
          </motion.div>
        )}

        {/* ── Act 4: ShareCard Preview ── */}
        {act === 4 && (
          <motion.div
            key="act4"
            {...stampSlam}
            className="px-4"
          >
            <div className="w-72 md:w-96 aspect-square overflow-hidden rounded-lg shadow-2xl">
              <div className="origin-top-left scale-[0.333] md:scale-[0.37]">
                <NovelShareCard ref={cardRef} stats={stats} />
              </div>
            </div>
          </motion.div>
        )}

        {/* ── Act 5: Actions ── */}
        {act === 5 && (
          <motion.div
            key="act5"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={springs.gentle}
            className="text-center px-8 space-y-8"
          >
            {/* Hidden full-size card for PNG generation */}
            <div className="fixed -left-[9999px] -top-[9999px]" aria-hidden="true">
              <NovelShareCard ref={cardRef} stats={stats} />
            </div>

            {/* Preview */}
            <div className="w-72 md:w-80 aspect-square overflow-hidden rounded-lg shadow-2xl mx-auto">
              <div className="origin-top-left scale-[0.296] md:scale-[0.333]">
                <NovelShareCard stats={stats} />
              </div>
            </div>

            {/* Buttons */}
            <div className="flex flex-col items-center gap-4">
              <button
                onClick={handleDownload}
                disabled={downloading}
                className="px-8 py-3 bg-[#c49b48] text-[#3b1a0a] font-serif font-bold text-lg rounded-lg hover:bg-[#d4ab58] transition-colors disabled:opacity-50"
              >
                {downloading ? t('downloading') : t('download')}
              </button>
              <button
                onClick={handleShare}
                className="px-8 py-3 border border-[#c49b48]/40 text-[#c49b48] font-serif text-lg rounded-lg hover:border-[#c49b48] transition-colors"
              >
                {t('share')}
              </button>
              <button
                onClick={onDismiss}
                className="text-[#f0dfc0]/40 text-sm hover:text-[#f0dfc0]/70 transition-colors mt-4"
              >
                {t('close')}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
