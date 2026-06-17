'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronUp, ChevronDown, LayoutGrid, List, Edit3, BookOpen, Zap, Trash2,
} from 'lucide-react';
import { useStory, type CanonStatus, type Chapter } from '@/lib/store';
import {
  CarvedHeader, ParchmentCard, EmptyState, FeatureErrorBoundary,
  WaxSealBadge, InkStampButton, ParchmentTextarea,
} from '@/components/antiquarian';
import { useConfirm } from '@/components/antiquarian/parchment-modal';
import { readingTimeLabel } from '@/lib/analytics/pacing';
import { wordCount } from '@/lib/editor/serialization';

type Layout = 'grid' | 'list';
type CanonFilter = 'all' | CanonStatus;
type LengthFilter = 'all' | 'short' | 'medium' | 'long';

function lengthBucket(words: number): 'short' | 'medium' | 'long' {
  if (words < 1500) return 'short';
  if (words < 4000) return 'medium';
  return 'long';
}

const LENGTH_LABELS: Record<LengthFilter, string> = {
  all: 'All lengths',
  short: 'Short (<1.5k)',
  medium: 'Medium (1.5k–4k)',
  long: 'Long (4k+)',
};

export default function OutlinePage() {
  const { state, updateField } = useStory();
  const router = useRouter();
  const { confirm } = useConfirm();

  const [layout, setLayout] = useState<Layout>('grid');
  const [canonFilter, setCanonFilter] = useState<CanonFilter>('all');
  const [lengthFilter, setLengthFilter] = useState<LengthFilter>('all');
  const [editingSummaryId, setEditingSummaryId] = useState<string | null>(null);
  const [summaryDraft, setSummaryDraft] = useState('');

  const enrichedChapters = useMemo(
    () =>
      state.chapters.map((c, originalIndex) => ({
        chapter: c,
        originalIndex,
        wordCount: wordCount(c.content),
      })),
    [state.chapters],
  );

  const filtered = useMemo(() => {
    return enrichedChapters.filter(({ chapter, wordCount }) => {
      if (canonFilter !== 'all' && (chapter.canonStatus ?? 'flexible') !== canonFilter) {
        return false;
      }
      if (lengthFilter !== 'all' && lengthBucket(wordCount) !== lengthFilter) {
        return false;
      }
      return true;
    });
  }, [enrichedChapters, canonFilter, lengthFilter]);

  const handleReorder = (originalIndex: number, direction: -1 | 1) => {
    const next = [...state.chapters];
    const target = originalIndex + direction;
    if (target < 0 || target >= next.length) return;
    [next[originalIndex], next[target]] = [next[target], next[originalIndex]];
    updateField('chapters', next);
  };

  const handleDelete = async (chapter: Chapter) => {
    const ok = await confirm({
      title: 'Delete chapter?',
      message: `Are you sure you want to delete "${chapter.title}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;
    updateField('chapters', state.chapters.filter(c => c.id !== chapter.id));
  };

  const handleStartEditSummary = (c: Chapter) => {
    setEditingSummaryId(c.id);
    setSummaryDraft(c.summary || '');
  };

  const handleCancelEditSummary = () => {
    setEditingSummaryId(null);
    setSummaryDraft('');
  };

  const handleSaveSummary = () => {
    if (!editingSummaryId) return;
    updateField(
      'chapters',
      state.chapters.map(c =>
        c.id === editingSummaryId ? { ...c, summary: summaryDraft.trim() } : c,
      ),
    );
    setEditingSummaryId(null);
    setSummaryDraft('');
  };

  const cardLayoutClass =
    layout === 'grid'
      ? 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4'
      : 'flex flex-col gap-3';

  return (
    <FeatureErrorBoundary title="Outline">
      <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
        <CarvedHeader
          title="Outline"
          subtitle="A bird's-eye corkboard of every chapter."
          icon={<LayoutGrid size={24} />}
          actions={
            <div className="flex items-center gap-1 rounded-lg bg-parchment-200 p-0.5 border border-sepia-300/40">
              <button
                type="button"
                onClick={() => setLayout('grid')}
                className={`flex items-center gap-1 px-2 py-1 rounded text-xs ${
                  layout === 'grid' ? 'bg-parchment-100 text-sepia-900 shadow-sm' : 'text-sepia-600 hover:text-sepia-800'
                }`}
                aria-label="Grid layout"
                aria-pressed={layout === 'grid'}
              >
                <LayoutGrid size={12} /> Grid
              </button>
              <button
                type="button"
                onClick={() => setLayout('list')}
                className={`flex items-center gap-1 px-2 py-1 rounded text-xs ${
                  layout === 'list' ? 'bg-parchment-100 text-sepia-900 shadow-sm' : 'text-sepia-600 hover:text-sepia-800'
                }`}
                aria-label="List layout"
                aria-pressed={layout === 'list'}
              >
                <List size={12} /> List
              </button>
            </div>
          }
        />

        {/* Filter chips */}
        <div className="flex items-center gap-3 flex-wrap" role="toolbar" aria-label="Outline filters">
          <span className="text-xs uppercase tracking-wider text-sepia-600">Canon:</span>
          <div className="flex items-center gap-1 flex-wrap">
            {(['all', 'confirmed', 'flexible', 'draft', 'discarded'] as CanonFilter[]).map(s => (
              <button
                key={s}
                type="button"
                onClick={() => setCanonFilter(s)}
                className={`px-2 py-0.5 rounded-full text-xs border transition-colors ${
                  canonFilter === s
                    ? 'bg-brass-500/20 border-brass-500/40 text-brass-800'
                    : 'border-sepia-300/40 text-sepia-600 hover:text-sepia-800 hover:border-sepia-400/60'
                }`}
                aria-pressed={canonFilter === s}
              >
                {s === 'all' ? 'all' : s}
              </button>
            ))}
          </div>
          <span className="text-xs uppercase tracking-wider text-sepia-600 ml-3">Length:</span>
          <div className="flex items-center gap-1 flex-wrap">
            {(['all', 'short', 'medium', 'long'] as LengthFilter[]).map(s => (
              <button
                key={s}
                type="button"
                onClick={() => setLengthFilter(s)}
                className={`px-2 py-0.5 rounded-full text-xs border transition-colors ${
                  lengthFilter === s
                    ? 'bg-brass-500/20 border-brass-500/40 text-brass-800'
                    : 'border-sepia-300/40 text-sepia-600 hover:text-sepia-800 hover:border-sepia-400/60'
                }`}
                aria-pressed={lengthFilter === s}
                title={LENGTH_LABELS[s]}
              >
                {s}
              </button>
            ))}
          </div>
          <span className="text-xs text-sepia-600 ml-auto">
            {filtered.length} of {state.chapters.length} chapter{state.chapters.length === 1 ? '' : 's'}
          </span>
        </div>

        {state.chapters.length === 0 && (
          <EmptyState
            variant="manuscript"
            title="No chapters yet"
            subtitle="Add chapters on the manuscript page; they'll show up here as cards."
            action={{ label: 'Open Manuscript', href: '/manuscript' }}
          />
        )}

        {state.chapters.length > 0 && filtered.length === 0 && (
          <ParchmentCard padding="lg">
            <p className="text-sm text-sepia-600 italic">
              No chapters match the current filters.
            </p>
          </ParchmentCard>
        )}

        <div className={cardLayoutClass}>
          {filtered.map(({ chapter, originalIndex, wordCount }) => (
            <ParchmentCard key={chapter.id} variant="aged" padding="md" className="flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-serif font-semibold text-sepia-900 leading-tight min-w-0 break-words">
                  {chapter.title}
                </h3>
                {chapter.canonStatus && <WaxSealBadge status={chapter.canonStatus} />}
              </div>

              <div className="flex items-center gap-2 text-xs text-sepia-600 font-mono">
                <span>#{originalIndex + 1}</span>
                <span>·</span>
                <span>{wordCount.toLocaleString()} words</span>
                <span>·</span>
                <span>{readingTimeLabel(wordCount)}</span>
              </div>

              {editingSummaryId === chapter.id ? (
                <div className="space-y-2">
                  <ParchmentTextarea
                    value={summaryDraft}
                    onChange={e => setSummaryDraft(e.target.value)}
                    className="h-24 text-sm"
                    placeholder="One-line summary…"
                    autoFocus
                  />
                  <div className="flex items-center gap-2">
                    <InkStampButton size="sm" variant="primary" onClick={handleSaveSummary}>
                      Save
                    </InkStampButton>
                    <InkStampButton size="sm" variant="ghost" onClick={handleCancelEditSummary}>
                      Cancel
                    </InkStampButton>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => handleStartEditSummary(chapter)}
                  className="text-left text-sm text-sepia-700 hover:text-sepia-900 leading-relaxed line-clamp-4 min-h-[2.5em]"
                  aria-label={`Edit summary for ${chapter.title}`}
                >
                  {chapter.summary || <span className="italic text-sepia-600">No summary yet — tap to add.</span>}
                </button>
              )}

              <div className="mt-auto pt-2 flex items-center justify-between border-t border-sepia-300/30 gap-1">
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => handleReorder(originalIndex, -1)}
                    disabled={originalIndex === 0}
                    className="p-1 rounded text-sepia-600 hover:text-sepia-800 hover:bg-sepia-300/30 disabled:opacity-30"
                    aria-label={`Move ${chapter.title} up`}
                  >
                    <ChevronUp size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleReorder(originalIndex, 1)}
                    disabled={originalIndex === state.chapters.length - 1}
                    className="p-1 rounded text-sepia-600 hover:text-sepia-800 hover:bg-sepia-300/30 disabled:opacity-30"
                    aria-label={`Move ${chapter.title} down`}
                  >
                    <ChevronDown size={14} />
                  </button>
                </div>
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => router.push('/manuscript')}
                    className="p-1.5 rounded text-sepia-600 hover:text-brass-600 hover:bg-brass-500/10"
                    aria-label="Open in manuscript editor"
                    title="Open in Manuscript"
                  >
                    <BookOpen size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push('/flow')}
                    className="p-1.5 rounded text-sepia-600 hover:text-forest-700 hover:bg-forest-700/10"
                    aria-label="Open in flow mode"
                    title="Open in Flow Mode"
                  >
                    <Zap size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleStartEditSummary(chapter)}
                    className="p-1.5 rounded text-sepia-600 hover:text-sepia-800 hover:bg-sepia-300/30"
                    aria-label="Edit summary"
                    title="Edit summary"
                  >
                    <Edit3 size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(chapter)}
                    className="p-1.5 rounded text-sepia-600 hover:text-wax-600 hover:bg-wax-500/10"
                    aria-label="Delete chapter"
                    title="Delete chapter"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </ParchmentCard>
          ))}
        </div>
      </div>
    </FeatureErrorBoundary>
  );
}
