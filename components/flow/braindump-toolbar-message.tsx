'use client';

import { AlertCircle, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface BraindumpToolbarMessageProps {
  type: 'unsupported' | 'denied';
  onDismiss: () => void;
}

export function BraindumpToolbarMessage({ type, onDismiss }: BraindumpToolbarMessageProps) {
  const t = useTranslations('flow.braindumpMessage');
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-300">
      <AlertCircle size={14} className="shrink-0" />
      <span>
        {type === 'unsupported' ? (
          t.rich('unsupported', { b: (chunks) => <strong>{chunks}</strong> })
        ) : (
          t.rich('denied', {
            link: (chunks) => (
              <a href="https://support.google.com/chrome/answer/2693767" target="_blank" rel="noopener noreferrer" className="underline hover:text-amber-200">{chunks}</a>
            ),
          })
        )}
      </span>
      <button
        onClick={onDismiss}
        className="shrink-0 p-0.5 rounded hover:bg-amber-500/20 transition-colors"
        aria-label={t('dismiss')}
      >
        <X size={12} />
      </button>
    </div>
  );
}
