'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
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

function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return 'less than a minute';
  if (minutes === 1) return '1 minute';
  return `${minutes} minutes`;
}

const FALLBACK_QUESTIONS = [
  'What surprised you about what you wrote today?',
  'Which character felt most alive in this session?',
  'What would your protagonist say about today\'s work?',
  'Did you discover something unexpected about your story?',
  'What scene are you most curious to write next?',
];

export function ClosingRitual({ open, stats, onClose }: ClosingRitualProps) {
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
    const fallback = FALLBACK_QUESTIONS[Math.floor(Math.random() * FALLBACK_QUESTIONS.length)];
    return { q: fallback, degraded: true };
  }, [stats.content, stats.wordsWritten]);

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
          aria-label="Close ritual"
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
                  Session Complete
                </h2>
                <div className="space-y-2">
                  <p className="text-4xl font-bold text-brass-400">
                    {stats.wordsWritten} <span className="text-lg font-normal text-cream-300">words</span>
                  </p>
                  <p className="text-sm text-cream-300">
                    {formatDuration(stats.sessionDurationMs)}
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
                  Your best sentence
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
                  Every word counts
                </h2>
                <p className="text-cream-200">
                  Keep writing. The best sentences come when you least expect them.
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
                  Reflect
                </h2>
                <p className="text-xl font-serif text-cream-100 leading-relaxed">
                  {question || 'What surprised you about what you wrote today?'}
                </p>
                {degraded && (
                  <p
                    className="text-xs italic text-cream-400/70"
                    title="The oracle rests; an older voice answers"
                  >
                    The oracle rests; an older voice answers.
                  </p>
                )}
                <button
                  onClick={onClose}
                  className="mt-8 px-6 py-2 bg-brass-600 hover:bg-brass-500 text-cream-50 rounded-lg transition-colors text-sm font-medium"
                >
                  Close
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
                aria-label={`Section ${i + 1}`}
              />
            ))}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
