'use client';

import { useEffect, useRef, useCallback } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import type { FlowScore } from '@/lib/types/writing-session';

const AUTO_DISMISS_MS = 30_000;

const flowOptions: { score: FlowScore; emoji: string; label: string }[] = [
  { score: 1, emoji: '😩', label: 'Struggled' },
  { score: 2, emoji: '🙁', label: 'Slow' },
  { score: 3, emoji: '😐', label: 'Okay' },
  { score: 4, emoji: '🙂', label: 'Good' },
  { score: 5, emoji: '🔥', label: 'On fire' },
];

interface FlowScoreModalProps {
  sessionId: string;
  onSubmit: (sessionId: string, score: FlowScore) => void;
  onDismiss: () => void;
}

export function FlowScoreModal({ sessionId, onSubmit, onDismiss }: FlowScoreModalProps) {
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-dismiss after 30s
  useEffect(() => {
    dismissTimerRef.current = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    };
  }, [onDismiss]);

  // Focus container on mount for keyboard support
  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onDismiss();
        return;
      }
      // Number keys 1-5 to select score
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= 5) {
        onSubmit(sessionId, num as FlowScore);
      }
    },
    [sessionId, onSubmit, onDismiss]
  );

  return (
    <AnimatePresence>
      <motion.div
        ref={containerRef}
        role="dialog"
        aria-label="Rate your writing flow"
        tabIndex={-1}
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.95 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        onKeyDown={handleKeyDown}
        className="fixed bottom-20 right-4 z-[90] bg-parchment-100 border border-sepia-300/40 rounded-xl p-4 shadow-2xl w-72 relative texture-parchment"
      >
        <button
          onClick={onDismiss}
          aria-label="Close"
          className="absolute top-2 right-2 text-sepia-600 hover:text-sepia-700 transition-colors rounded p-0.5"
        >
          <X size={16} />
        </button>
        <p className="text-sm font-medium text-sepia-800 mb-3">
          How did this session flow?
        </p>
        <div className="flex gap-2 justify-between" role="radiogroup" aria-label="Flow score">
          {flowOptions.map(({ score, emoji, label }) => (
            <button
              key={score}
              onClick={() => onSubmit(sessionId, score)}
              aria-label={`${label} — ${score} out of 5`}
              className="flex flex-col items-center gap-1 px-2 py-1.5 rounded-lg hover:bg-parchment-200 transition-colors focus:outline-none focus:ring-2 focus:ring-brass-400 focus:outline-offset-1"
            >
              <span className="text-2xl" role="img" aria-hidden="true">
                {emoji}
              </span>
              <span className="text-[10px] text-sepia-600">{label}</span>
            </button>
          ))}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
