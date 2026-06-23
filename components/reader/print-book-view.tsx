'use client';

import { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { paginateText, estimateReadingTime } from '@/lib/reader-utils';
import { ParchmentCard } from '@/components/antiquarian';
import { ProseAnnotations } from './prose-annotations';
import type { ProseIssue } from '@/lib/prose-analysis';

interface PrintBookViewProps {
  title: string;
  content: string;
  issues: ProseIssue[];
}

export function PrintBookView({ title, content, issues }: PrintBookViewProps) {
  const t = useTranslations('readerView');
  const pages = useMemo(() => paginateText(content), [content]);
  const [currentPage, setCurrentPage] = useState(0);
  const readingTime = useMemo(() => estimateReadingTime(content), [content]);
  const readTimeLabel = readingTime.minutes < 60
    ? t('readTimeMin', { minutes: readingTime.minutes })
    : t('readTimeHourMin', { hours: Math.floor(readingTime.minutes / 60), minutes: readingTime.minutes % 60 });

  if (!content.trim()) {
    return <div className="text-center py-16 text-sepia-600">{t('empty')}</div>;
  }

  return (
    <div className="flex flex-col items-center py-8 px-4" data-testid="print-book-view">
      {/* Book page */}
      <ParchmentCard className="w-full max-w-[6in] min-h-[9in] p-[1.5in] texture-parchment relative print:shadow-none print:border-none">
        <h2 className="text-2xl font-serif text-sepia-900 mb-8 text-center" style={{ fontFamily: "'Playfair Display', serif" }}>
          {title}
        </h2>
        <div
          className="font-serif text-sm text-sepia-900 leading-[1.8] whitespace-pre-wrap"
          style={{ fontFamily: "'Playfair Display', serif", fontSize: '14px' }}
        >
          {issues.length > 0 ? (
            <ProseAnnotations text={pages[currentPage] || ''} issues={issues} />
          ) : (
            pages[currentPage]
          )}
        </div>
        {/* Page number */}
        <div className="absolute bottom-6 left-0 right-0 text-center text-xs text-sepia-600">
          {currentPage + 1}
        </div>
      </ParchmentCard>

      {/* Controls */}
      <div className="flex items-center gap-4 mt-4">
        <button
          onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
          disabled={currentPage === 0}
          className={`p-2 rounded ${currentPage === 0 ? 'text-sepia-300' : 'text-sepia-600 hover:text-sepia-800'}`}
          aria-label={t('prevPageAria')}
        >
          <ChevronLeft size={20} />
        </button>
        <span className="text-sm text-sepia-600">
          {t('pageOf', { current: currentPage + 1, total: pages.length, readTime: readTimeLabel })}
        </span>
        <button
          onClick={() => setCurrentPage(p => Math.min(pages.length - 1, p + 1))}
          disabled={currentPage >= pages.length - 1}
          className={`p-2 rounded ${currentPage >= pages.length - 1 ? 'text-sepia-300' : 'text-sepia-600 hover:text-sepia-800'}`}
          aria-label={t('nextPageAria')}
        >
          <ChevronRight size={20} />
        </button>
      </div>
    </div>
  );
}
