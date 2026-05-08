'use client';

import { ChevronLeft, ChevronRight, ArrowLeft, Search } from 'lucide-react';
import type { ProseIssue } from '@/lib/prose-analysis';

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

function formatAnalyzedAgo(ts: number): string {
  const diffMs = Date.now() - ts;
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
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
  const hasPrev = currentChapterIndex > 0;
  const hasNext = currentChapterIndex < chapters.length - 1;

  return (
    <div className="min-h-screen bg-parchment-100 flex flex-col" data-testid="reader-layout">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-sepia-300/30 bg-parchment-50">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-sepia-500 hover:text-sepia-700 transition-colors" aria-label="Back to manuscript">
            <ArrowLeft size={18} />
          </button>
          <select
            value={currentChapterIndex}
            onChange={e => onChapterChange(Number(e.target.value))}
            className="bg-transparent text-sm text-sepia-800 font-medium border-none focus:outline-none cursor-pointer"
            aria-label="Select chapter"
          >
            {chapters.map((ch, i) => (
              <option key={ch.id} value={i}>{ch.title}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          {analyzedAt && !isAnalyzing && (
            <span
              className="text-[10px] text-sepia-400 italic hidden sm:inline"
              title={`Analyzed ${new Date(analyzedAt).toLocaleString()}`}
            >
              Analyzed {formatAnalyzedAgo(analyzedAt)}
            </span>
          )}
          <button
            onClick={onAnalyze}
            disabled={isAnalyzing}
            className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg transition-colors ${
              isAnalyzing ? 'bg-sepia-200 text-sepia-400' : 'bg-parchment-200 hover:bg-parchment-300 text-sepia-700'
            }`}
            aria-label="Analyze prose"
          >
            <Search size={12} />
            {isAnalyzing ? 'Analyzing...' : issues.length > 0 ? `${issues.length} issues` : 'Analyze'}
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
          aria-label="Previous chapter"
        >
          <ChevronLeft size={16} /> Previous
        </button>
        <span className="text-xs text-sepia-400">
          Chapter {currentChapterIndex + 1} of {chapters.length}
        </span>
        <button
          onClick={() => hasNext && onChapterChange(currentChapterIndex + 1)}
          disabled={!hasNext}
          className={`flex items-center gap-1 text-sm ${hasNext ? 'text-sepia-700 hover:text-sepia-900' : 'text-sepia-300'}`}
          aria-label="Next chapter"
        >
          Next <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
