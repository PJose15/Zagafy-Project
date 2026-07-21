'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AnimatePresence, motion } from 'motion/react';
import { fadeUp } from '@/lib/animations';
import { useStory } from '@/lib/store';
import { ReaderLayout } from '@/components/reader/reader-layout';
import { ReadingRibbon } from '@/components/reader/reading-ribbon';
import { PrintBookView } from '@/components/reader/print-book-view';
import { KindleView } from '@/components/reader/kindle-view';
import { AudiobookView } from '@/components/reader/audiobook-view';
import type { ProseIssue } from '@/lib/prose-analysis';
import { getOrAnalyze, readCachedAnalysis } from '@/lib/prose-analysis-cache';
import { getPlainText } from '@/lib/editor/serialization';
import { EmptyState, FeatureErrorBoundary } from '@/components/antiquarian';

type ReaderMode = 'print' | 'kindle' | 'audiobook';

export default function ReaderPage() {
  const t = useTranslations('reader');
  const { state } = useStory();
  const router = useRouter();
  const [chapterIndex, setChapterIndex] = useState(0);
  const [mode, setMode] = useState<ReaderMode>('print');
  const [issues, setIssues] = useState<ProseIssue[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzedAt, setAnalyzedAt] = useState<number | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const chapters = state.chapters.filter(ch => ch.canonStatus !== 'discarded');
  // Clamp: a cross-tab delete can shrink the list below the current index
  // while this page is mounted.
  const safeChapterIndex = Math.max(0, Math.min(chapterIndex, chapters.length - 1));
  const chapter = chapters[safeChapterIndex];
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
    setAnalysisError(null);
    try {
      const result = await getOrAnalyze(chapter.id, plainContent);
      setIssues(result.issues);
      setAnalyzedAt(result.analyzedAt);
    } catch {
      setAnalysisError(t('analysisError'));
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleChapterChange = (index: number) => {
    setChapterIndex(index);
    setIssues([]);
    setAnalyzedAt(null);
    setAnalysisError(null);
  };

  if (chapters.length === 0) {
    return (
      <div className="min-h-screen bg-parchment-100 flex items-center justify-center">
        <EmptyState
          variant="manuscript"
          title={t('emptyTitle')}
          subtitle={t('emptySubtitle')}
          action={{ label: t('goToManuscript'), href: '/manuscript' }}
        />
      </div>
    );
  }

  return (
    <FeatureErrorBoundary title={t('errorTitle')}>
    {/* M22: the reading ribbon lengthens as you make your way down the page */}
    <ReadingRibbon />
    <ReaderLayout
      chapters={chapters.map(ch => ({ id: ch.id, title: ch.title }))}
      currentChapterIndex={safeChapterIndex}
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
            {m === 'print' ? t('modePrint') : m === 'kindle' ? t('modeKindle') : t('modeAudiobook')}
          </button>
        ))}
      </div>

      {analysisError && (
        <div role="alert" className="mx-auto max-w-2xl px-4 py-3 text-sm text-wax-700">
          {analysisError}
        </div>
      )}

      {/* Crossfade between modes and chapters — a soft "page turn" */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={`${mode}-${chapterId}`} {...fadeUp}>
          {mode === 'print' && <PrintBookView title={chapter.title} content={plainContent} issues={issues} />}
          {mode === 'kindle' && <KindleView title={chapter.title} content={plainContent} issues={issues} />}
          {mode === 'audiobook' && <AudiobookView title={chapter.title} content={plainContent} />}
        </motion.div>
      </AnimatePresence>
    </ReaderLayout>
    </FeatureErrorBoundary>
  );
}
