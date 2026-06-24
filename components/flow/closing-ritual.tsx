'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslations } from 'next-intl';
import { X } from 'lucide-react';

interface ClosingRitualStats {
  wordsWritten: number;
  sessionDurationMs: number;
  content: string;
}

interface ClosingRitualProps {
  open: boolean;
  stats: ClosingRitualStats;
  onClose: () => void;
}

function findBestSentence(content: string): string | null {
  const sentences = content
    .split(/[.!?]+/)
    .map(s => s.trim())
    .filter(s => {
      const words = s.split(/\s+/).filter(Boolean);
      return words.length > 10;
    });

  if (sentences.length === 0) return null;

  let best = sentences[0];
  let bestAvg = 0;

  for (const sentence of sentences) {
    const words = sentence.split(/\s+/).filter(Boolean);
    const avg = words.reduce((sum, w) => sum + w.length, 0) / words.length;
    if (avg > bestAvg) {
      bestAvg = avg;
      best = sentence;
    }
  }

  return best;
}

type Translator = ReturnType<typeof useTranslations>;

function formatDuration(ms: number, t: Translator): string {
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return t('durationLessThanMinute');
  if (minutes === 1) return t('durationMinute');
  return t('durationMinutes', { count: minutes });
}

export function ClosingRitual({ open, stats, onClose }: ClosingRitualProps) {
  const t = useTranslations('flow.closingRitual');
  const fallbackQuestions = useMemo(
    () => [t('q1'), t('q2'), t('q3'), t('q4'), t('q5')],
    [t]
  );
  const [section, setSection] = useState(0);
  const [question, setQuestion] = useState<string | null>(null);
  const [degraded, setDegraded] = useState(false);
  const [prevOpen, setPrevOpen] = useState(false);

  // Derived state: reset section when opening (React 19 pattern)
  if (open && !prevOpen) {
    setPrevOpen(true);
    setSection(0);
    setQuestion(null);
    setDegraded(false);
  }
  if (!open && prevOpen) {
    setPrevOpen(false);
  }

  const bestSentence = findBestSentence(stats.content);

  const fetchQuestionValue = useCallback(async (): Promise<{ q: string; degraded: boolean }> => {
    try {
      const res = await fetch('/api/closing-question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storyContext: stats.content.slice(-500),
          wordsWritten: stats.wordsWritten,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.question) return { q: data.question, degraded: data.degraded === true };
      }
    } catch {
      // fallback
    }
    const fallback = fallbackQuestions[Math.floor(Math.random() * fallbackQuestions.length)];
    return { q: fallback, degraded: true };
  }, [stats.content, stats.wordsWritten, fallbackQuestions]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetchQuestionValue().then(({ q, degraded: deg }) => {
      if (!cancelled) {
        setQuestion(q);
        setDegraded(deg);
      }
    });
    return () => { cancelled = true; };
  }, [open, fetchQuestionValue]);

  // Auto-advance sections every 10 seconds
  useEffect(() => {
    if (!open) return;
    if (section >= 2) return;

    const timer = setTimeout(() => {
      setSection(prev => prev + 1);
    }, 10000);

    return () => clearTimeout(timer);
  }, [open, section]);

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[300] bg-mahogany-950 flex items-center justify-center p-8"
      >
        <button
          onClick={onClose}
          className="absolute top-6 right-6 text-cream-200 hover:text-cream-50 transition-colors"
          aria-label={t('close')}
        >
          <X size={24} />
        </button>

        <div className="max-w-lg w-full text-center space-y-8">
          <AnimatePresence mode="wait">
            {section === 0 && (
              <motion.div
                key="stats"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-4"
              >
                <h2 className="text-2xl font-serif text-cream-100 tracking-tight">
                  {t('sessionComplete')}
                </h2>
                <div className="space-y-2">
                  <p className="text-4xl font-bold text-brass-400">
                    {stats.wordsWritten} <span className="text-lg font-normal text-cream-300">{t('wordsLabel')}</span>
                  </p>
                  <p className="text-sm text-cream-300">
                    {formatDuration(stats.sessionDurationMs, t)}
                  </p>
                </div>
              </motion.div>
            )}

            {section === 1 && bestSentence && (
              <motion.div
                key="best"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-4"
              >
                <h2 className="text-lg font-serif text-cream-300 tracking-tight">
                  {t('bestSentence')}
                </h2>
                <blockquote className="text-xl font-serif text-cream-100 italic leading-relaxed px-4">
                  &ldquo;{bestSentence}&rdquo;
                </blockquote>
              </motion.div>
            )}

            {section === 1 && !bestSentence && (
              <motion.div
                key="no-best"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-4"
              >
                <h2 className="text-lg font-serif text-cream-300 tracking-tight">
                  {t('everyWordCounts')}
                </h2>
                <p className="text-cream-200">
                  {t('everyWordCountsBody')}
                </p>
              </motion.div>
            )}

            {section >= 2 && (
              <motion.div
                key="question"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6"
              >
                <h2 className="text-lg font-serif text-cream-300 tracking-tight">
                  {t('reflect')}
                </h2>
                <p className="text-xl font-serif text-cream-100 leading-relaxed">
                  {question || t('q1')}
                </p>
                {degraded && (
                  <p
                    className="text-xs italic text-cream-400/70"
                    title={t('degradedNote')}
                  >
                    {t('degradedNote')}
                  </p>
                )}
                <button
                  onClick={onClose}
                  className="mt-8 px-6 py-2 bg-brass-600 hover:bg-brass-500 text-cream-50 rounded-lg transition-colors text-sm font-medium"
                >
                  {t('closeBtn')}
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Section indicators */}
          <div className="flex justify-center gap-2 pt-4">
            {[0, 1, 2].map(i => (
              <button
                key={i}
                onClick={() => setSection(i)}
                className={`w-2 h-2 rounded-full transition-colors ${
                  i === section ? 'bg-brass-400' : 'bg-cream-300/30'
                }`}
                aria-label={t('sectionAria', { number: i + 1 })}
              />
            ))}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
