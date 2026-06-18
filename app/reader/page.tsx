'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStory } from '@/lib/store';
import { ReaderLayout } from '@/components/reader/reader-layout';
import { PrintBookView } from '@/components/reader/print-book-view';
import { KindleView } from '@/components/reader/kindle-view';
import { AudiobookView } from '@/components/reader/audiobook-view';
import type { ProseIssue } from '@/lib/prose-analysis';
import { getOrAnalyze, readCachedAnalysis } from '@/lib/prose-analysis-cache';
import { getPlainText } from '@/lib/editor/serialization';
import { EmptyState, FeatureErrorBoundary } from '@/components/antiquarian';

type ReaderMode = 'print' | 'kindle' | 'audiobook';

export default function ReaderPage() {
  const { state } = useStory();
  const router = useRouter();
  const [chapterIndex, setChapterIndex] = useState(0);
  const [mode, setMode] = useState<ReaderMode>('print');
  const [issues, setIssues] = useState<ProseIssue[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzedAt, setAnalyzedAt] = useState<number | null>(null);

  const chapters = state.chapters.filter(ch => ch.canonStatus !== 'discarded');
  const chapter = chapters[chapterIndex];
  const chapterId = chapter?.id;
  // CB-07: chapter content is Lexical JSON; the reader views, pagination and
  // prose analysis all operate on plain text. Decode once so issue indices
  // align with what the views render.
  const plainContent = chapter ? getPlainText(chapter.content) : '';

  // CB-08: hydrate cached analysis when switching chapters so users see
  // results from prior sessions without clicking Analyze again.
  useEffect(() => {
    if (!chapterId || !plainContent.trim()) {
      setIssues([]);
      setAnalyzedAt(null);
      return;
    }
    let cancelled = false;
    readCachedAnalysis(chapterId, plainContent).then(cached => {
      if (cancelled) return;
      if (cached) {
        setIssues(cached.issues);
        setAnalyzedAt(cached.analyzedAt);
      } else {
        setIssues([]);
        setAnalyzedAt(null);
      }
    });
    return () => { cancelled = true; };
  }, [chapterId, plainContent]);

  const handleAnalyze = async () => {
    if (!chapter || !plainContent.trim()) return;
    setIsAnalyzing(true);
    try {
      const result = await getOrAnalyze(chapter.id, plainContent);
      setIssues(result.issues);
      setAnalyzedAt(result.analyzedAt);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleChapterChange = (index: number) => {
    setChapterIndex(index);
    setIssues([]);
    setAnalyzedAt(null);
  };

  if (chapters.length === 0) {
    return (
      <div className="min-h-screen bg-parchment-100 flex items-center justify-center">
        <EmptyState
          variant="manuscript"
          title="No chapters to read"
          subtitle="Write some chapters in the Manuscript page first."
          action={{ label: 'Go to Manuscript', href: '/manuscript' }}
        />
      </div>
    );
  }

  return (
    <FeatureErrorBoundary title="Reader Analysis">
    <ReaderLayout
      chapters={chapters.map(ch => ({ id: ch.id, title: ch.title }))}
      currentChapterIndex={chapterIndex}
      onChapterChange={handleChapterChange}
      onBack={() => router.push('/manuscript')}
      onAnalyze={handleAnalyze}
      isAnalyzing={isAnalyzing}
      issues={issues}
      analyzedAt={analyzedAt}
    >
      {/* Mode tabs */}
      <div className="flex justify-center gap-1 py-3 border-b border-sepia-300/20">
        {(['print', 'kindle', 'audiobook'] as ReaderMode[]).map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`px-4 py-1.5 text-sm rounded-lg transition-colors ${
              mode === m ? 'bg-sepia-300/40 text-sepia-900 font-medium' : 'text-sepia-600 hover:text-sepia-700'
            }`}
          >
            {m === 'print' ? 'Print Book' : m === 'kindle' ? 'Kindle' : 'Audiobook'}
          </button>
        ))}
      </div>

      {mode === 'print' && <PrintBookView title={chapter.title} content={plainContent} issues={issues} />}
      {mode === 'kindle' && <KindleView title={chapter.title} content={plainContent} issues={issues} />}
      {mode === 'audiobook' && <AudiobookView title={chapter.title} content={plainContent} />}
    </ReaderLayout>
    </FeatureErrorBoundary>
  );
}
