'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { X, Type, Sparkles, Trash2, Clock, Languages, FileText } from 'lucide-react';
import type { UseBraindumpReturn } from '@/hooks/use-braindump';

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
    ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

interface BraindumpHistoryDrawerProps {
  braindump: UseBraindumpReturn;
}

export function BraindumpHistoryDrawer({ braindump }: BraindumpHistoryDrawerProps) {
  const t = useTranslations('flow.braindumpHistory');
  const drawerRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') braindump.closeHistory();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [braindump]);

  // Close on click outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
        braindump.closeHistory();
      }
    };
    // Delay to prevent the opening click from immediately closing
    const timer = setTimeout(() => {
      window.addEventListener('mousedown', handleClick);
    }, 100);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('mousedown', handleClick);
    };
  }, [braindump]);

  return (
    <div
      ref={drawerRef}
      className="absolute top-0 right-0 bottom-0 max-w-[360px] w-full z-[170] bg-parchment-200/95 backdrop-blur-lg border-l border-sepia-300/30 flex flex-col"
      role="dialog"
      aria-label={t('ariaLabel')}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-sepia-300/30">
        <h3 className="text-sm font-medium text-sepia-700">{t('heading')}</h3>
        <button
          onClick={braindump.closeHistory}
          className="p-1 rounded-lg text-sepia-600 hover:text-sepia-700 hover:bg-parchment-200 transition-colors"
          aria-label={t('close')}
        >
          <X size={14} />
        </button>
      </div>

      {/* Entries */}
      <div className="flex-1 overflow-y-auto">
        {braindump.history.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-sepia-600 px-6">
            <FileText size={32} className="mb-3 opacity-50" />
            <p className="text-sm text-center">{t('emptyTitle')}</p>
            <p className="text-xs text-center mt-1">{t('emptySubtitle')}</p>
          </div>
        ) : (
          <div className="p-3 space-y-2">
            {[...braindump.history].reverse().map(entry => (
              <div
                key={entry.id}
                className="bg-parchment-100/50 border border-sepia-300/30 rounded-xl p-3 group"
              >
                {/* Meta row */}
                <div className="flex items-center gap-2 text-xs text-sepia-600 mb-2">
                  <Clock size={10} />
                  <span>{formatDate(entry.timestamp)}</span>
                  <span className="text-sepia-600">|</span>
                  <span>{formatDuration(entry.durationSeconds)}</span>
                  <span className="text-sepia-600">|</span>
                  <Languages size={10} />
                  <span>{entry.language}</span>
                  <span className="text-sepia-600">|</span>
                  <span>{t('words', { count: entry.wordCount })}</span>
                </div>

                {/* Preview */}
                <p className="text-sm text-sepia-700 leading-relaxed line-clamp-3 font-serif">
                  {entry.polishedText || entry.rawTranscript}
                </p>

                {entry.wasPolished && (
                  <div className="flex items-center gap-1 mt-1.5 text-xs text-brass-500/60">
                    <Sparkles size={10} />
                    <span>{t('polished')}</span>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-1 mt-2 pt-2 border-t border-sepia-300/30">
                  <button
                    onClick={() => braindump.reInsertFromHistory(entry.id)}
                    className="flex items-center gap-1 px-2 py-1 rounded text-xs text-sepia-600 hover:text-sepia-800 hover:bg-parchment-200 transition-colors"
                    aria-label={t('reInsertAria')}
                  >
                    <Type size={12} />
                    {t('reInsert')}
                  </button>
                  {!entry.wasPolished && (
                    <button
                      onClick={() => braindump.rePolishFromHistory(entry.id)}
                      disabled={braindump.isPolishing}
                      className="flex items-center gap-1 px-2 py-1 rounded text-xs text-brass-500 hover:text-brass-400 hover:bg-parchment-200 transition-colors disabled:opacity-50"
                      aria-label={t('polishAria')}
                    >
                      <Sparkles size={12} />
                      {t('polish')}
                    </button>
                  )}
                  <button
                    onClick={() => braindump.deleteHistoryEntry(entry.id)}
                    className="flex items-center gap-1 px-2 py-1 rounded text-xs text-sepia-600 hover:text-wax-500 hover:bg-parchment-200 transition-colors ml-auto"
                    aria-label={t('deleteAria')}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
