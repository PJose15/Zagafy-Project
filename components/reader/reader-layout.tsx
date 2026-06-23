'use client';

import { useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight, ArrowLeft, Search } from 'lucide-react';
import type { ProseIssue } from '@/lib/prose-analysis';
import { useRelativeTime } from '@/lib/i18n/useRelativeTime';

interface ReaderLayoutProps {
  chapters: { id: string; title: string }[];
  currentChapterIndex: number;
  onChapterChange: (index: number) => void;
  onBack: () => void;
  onAnalyze: () => void;
  isAnalyzing: boolean;
  issues: ProseIssue[];
  /** CB-08: epoch-ms timestamp of the cached analysis, or null if never run on this content. */
  analyzedAt?: number | null;
  children: React.ReactNode;
}

export function ReaderLayout({
  chapters,
  currentChapterIndex,
  onChapterChange,
  onBack,
  onAnalyze,
  isAnalyzing,
  issues,
  analyzedAt,
  children,
}: ReaderLayoutProps) {
  const t = useTranslations('readerView');
  const formatRelative = useRelativeTime();
  const hasPrev = currentChapterIndex > 0;
  const hasNext = currentChapterIndex < chapters.length - 1;

  return (
    <div className="min-h-screen bg-parchment-100 flex flex-col" data-testid="reader-layout">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-sepia-300/30 bg-parchment-50">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-sepia-600 hover:text-sepia-700 transition-colors" aria-label={t('backAria')}>
            <ArrowLeft size={18} />
          </button>
          <select
            value={currentChapterIndex}
            onChange={e => onChapterChange(Number(e.target.value))}
            className="bg-transparent text-sm text-sepia-800 font-medium border-none focus:outline-none cursor-pointer"
            aria-label={t('selectChapterAria')}
          >
            {chapters.map((ch, i) => (
              <option key={ch.id} value={i}>{ch.title}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          {analyzedAt && !isAnalyzing && (
            <span
              className="text-[10px] text-sepia-600 italic hidden sm:inline"
              title={t('analyzedTitle', { datetime: new Date(analyzedAt).toLocaleString() })}
            >
              {t('analyzedAgo', { ago: formatRelative(analyzedAt) })}
            </span>
          )}
          <button
            onClick={onAnalyze}
            disabled={isAnalyzing}
            className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg transition-colors ${
              isAnalyzing ? 'bg-sepia-200 text-sepia-600' : 'bg-parchment-200 hover:bg-parchment-300 text-sepia-700'
            }`}
            aria-label={t('analyzeAria')}
          >
            <Search size={12} />
            {isAnalyzing ? t('analyzing') : issues.length > 0 ? t('issues', { count: issues.length }) : t('analyze')}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1">{children}</div>

      {/* Navigation footer */}
      <div className="flex items-center justify-between px-6 py-3 border-t border-sepia-300/30 bg-parchment-50">
        <button
          onClick={() => hasPrev && onChapterChange(currentChapterIndex - 1)}
          disabled={!hasPrev}
          className={`flex items-center gap-1 text-sm ${hasPrev ? 'text-sepia-700 hover:text-sepia-900' : 'text-sepia-300'}`}
          aria-label={t('prevAria')}
        >
          <ChevronLeft size={16} /> {t('prev')}
        </button>
        <span className="text-xs text-sepia-600">
          {t('chapterOf', { current: currentChapterIndex + 1, total: chapters.length })}
        </span>
        <button
          onClick={() => hasNext && onChapterChange(currentChapterIndex + 1)}
          disabled={!hasNext}
          className={`flex items-center gap-1 text-sm ${hasNext ? 'text-sepia-700 hover:text-sepia-900' : 'text-sepia-300'}`}
          aria-label={t('nextAria')}
        >
          {t('next')} <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
