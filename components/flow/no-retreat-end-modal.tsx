'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslations } from 'next-intl';
import { BrassButton } from '@/components/antiquarian';
import { useModalHygiene } from '@/hooks/use-modal-hygiene';
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
  const t = useTranslations('flow.noRetreatEnd');
  const panelRef = useRef<HTMLDivElement>(null);
  // Z2: scroll lock + Tab trap; Escape takes the safe path (save the words).
  useModalHygiene(panelRef, onSave, open);

  // Z7: burning a session's words is irreversible — the button arms on the
  // first press and only burns on the second; it stands down after 3s.
  // (A nested confirm dialog can't be used: this modal sits above the
  // ConfirmProvider's z-index.)
  const [burnArmed, setBurnArmed] = useState(false);
  useEffect(() => {
    if (!burnArmed) return;
    const timer = setTimeout(() => setBurnArmed(false), 3000);
    return () => clearTimeout(timer);
  }, [burnArmed]);

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
            ref={panelRef}
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="bg-parchment-100 rounded-xl border border-sepia-300/50 shadow-card-hover p-8 max-w-md w-full space-y-6"
          >
            <h2
              id="no-retreat-end-title"
              className="text-xl font-serif font-bold text-sepia-900 text-center"
            >
              {t('title')}
            </h2>

            <div className="grid grid-cols-2 gap-4 text-center">
              <div className="bg-parchment-200 rounded-lg p-4">
                <p className="text-2xl font-mono font-bold text-sepia-900">{stats.wordsWritten}</p>
                <p className="text-xs text-sepia-600 mt-1">{t('wordsWritten')}</p>
              </div>
              <div className="bg-parchment-200 rounded-lg p-4">
                <p className="text-2xl font-mono font-bold text-sepia-900">
                  {formatDuration(stats.sessionDurationMs)}
                </p>
                <p className="text-xs text-sepia-600 mt-1">{t('duration')}</p>
              </div>
            </div>

            <div className="flex gap-3 justify-center">
              <BrassButton onClick={onSave} icon={<Save size={16} />}>
                {t('save')}
              </BrassButton>
              <button
                onClick={() => {
                  if (burnArmed) onBurn();
                  else setBurnArmed(true);
                }}
                className={`inline-flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-lg text-cream-50 transition-colors burn-consume-trigger ${
                  burnArmed ? 'bg-wax-700 ring-2 ring-wax-500/60 hover:bg-wax-600' : 'bg-wax-600 hover:bg-wax-500'
                }`}
              >
                <Flame size={16} className="ember-rise-trigger" />
                {burnArmed ? t('burnConfirm') : t('burn')}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
