'use client';

import { motion, AnimatePresence } from 'motion/react';
import { BrassButton } from '@/components/antiquarian';
import { Flame, Save } from 'lucide-react';

interface SessionStats {
  wordsWritten: number;
  sessionDurationMs: number;
}

interface NoRetreatEndModalProps {
  open: boolean;
  stats: SessionStats;
  onSave: () => void;
  onBurn: () => void;
}

function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

export function NoRetreatEndModal({ open, stats, onSave, onBurn }: NoRetreatEndModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[250] bg-black/60 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="no-retreat-end-title"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="bg-parchment-100 rounded-xl border border-sepia-300/50 shadow-card-hover p-8 max-w-md w-full space-y-6"
          >
            <h2
              id="no-retreat-end-title"
              className="text-xl font-serif font-bold text-sepia-900 text-center"
            >
              End No-Retreat Session
            </h2>

            <div className="grid grid-cols-2 gap-4 text-center">
              <div className="bg-parchment-200 rounded-lg p-4">
                <p className="text-2xl font-mono font-bold text-sepia-900">{stats.wordsWritten}</p>
                <p className="text-xs text-sepia-600 mt-1">Words Written</p>
              </div>
              <div className="bg-parchment-200 rounded-lg p-4">
                <p className="text-2xl font-mono font-bold text-sepia-900">
                  {formatDuration(stats.sessionDurationMs)}
                </p>
                <p className="text-xs text-sepia-600 mt-1">Duration</p>
              </div>
            </div>

            <div className="flex gap-3 justify-center">
              <BrassButton onClick={onSave} icon={<Save size={16} />}>
                Save
              </BrassButton>
              <button
                onClick={onBurn}
                className="inline-flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-lg bg-wax-600 text-cream-50 hover:bg-wax-500 transition-colors burn-consume-trigger"
              >
                <Flame size={16} className="ember-rise-trigger" />
                Burn
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
