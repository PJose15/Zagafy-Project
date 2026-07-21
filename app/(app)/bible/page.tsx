'use client';

import { useStory } from '@/lib/store';
import { getPlainText } from '@/lib/editor/serialization';
import {
  getActiveProjectId,
  PROJECT_CHANGED,
  PROJECT_CHANGED_EVENT,
} from '@/lib/projects/active-project';
import { useState, useCallback, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes';
import {
  Save, Settings2, Plus, Globe, Scroll, Wand2,
  Landmark, Church, Coins, Languages, CalendarDays, AlertTriangle, X,
} from 'lucide-react';
import { motion } from 'motion/react';
import { stagger } from '@/lib/animations';
import { useToast } from '@/components/toast';
import {
  InkStampButton, CarvedHeader, DecorativeDivider,
  ParchmentInput, ParchmentTextarea, ParchmentCard, FeatureErrorBoundary, EmptyState,
} from '@/components/antiquarian';
import { WorldBibleExtractButton } from '@/components/bible/WorldBibleExtractButton';
import { WorldBibleSectionCard } from '@/components/bible/WorldBibleSectionCard';
import { WorldBibleMergeModal } from '@/components/bible/WorldBibleMergeModal';
import { WorldBibleReviewQueue } from '@/components/bible/WorldBibleReviewQueue';
import {
  WORLD_BIBLE_CATEGORIES,
  type WorldBibleSection, type WorldBibleCategory,
} from '@/lib/types/world-bible';
import type { LucideIcon } from 'lucide-react';

const CATEGORY_ICONS: Record<WorldBibleCategory, LucideIcon> = {
  geography: Globe,
  history: Scroll,
  'magic-tech': Wand2,
  politics: Landmark,
  'religion-culture': Church,
  economy: Coins,
  languages: Languages,
  calendar: CalendarDays,
};

export default function BiblePage() {
  const t = useTranslations('bible');
  const { toast } = useToast();
  const { state, updateField } = useStory();
  const [title, setTitle] = useState(state.title);
  const [synopsis, setSynopsis] = useState(state.synopsis);
  const [styleProfile, setStyleProfile] = useState(state.style_profile);
  const [authorIntent, setAuthorIntent] = useState(state.author_intent);
  const [isSaving, setIsSaving] = useState(false);

  const [selectedCategory, setSelectedCategory] = useState<WorldBibleCategory>('geography');
  const [mergeModalOpen, setMergeModalOpen] = useState(false);
  const [reviewQueueOpen, setReviewQueueOpen] = useState(false);
  const [incomingSections, setIncomingSections] = useState<WorldBibleSection[]>([]);
  const [extractError, setExtractError] = useState<string | null>(null);

  const draftCount = state.world_bible.filter(s => s.canonStatus === 'draft').length;

  // Track the active project id (same-tab DOM event + cross-tab broadcast).
  // The four form fields above are seeded from state only once, so a project
  // switch while this page is mounted would otherwise leave the OLD project's
  // values saveable into the NEW project.
  const [activeProjectId, setActiveProjectId] = useState(() => getActiveProjectId());
  useEffect(() => {
    const sync = () => setActiveProjectId(getActiveProjectId());
    window.addEventListener(PROJECT_CHANGED_EVENT, sync);
    let channel: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        channel = new BroadcastChannel('zagafy_sync');
        channel.addEventListener('message', (e: MessageEvent) => {
          if (e.data?.type === PROJECT_CHANGED) sync();
        });
      } catch {
        // BroadcastChannel unavailable — same-tab switches still re-seed.
      }
    }
    return () => {
      window.removeEventListener(PROJECT_CHANGED_EVENT, sync);
      channel?.close();
    };
  }, []);

  // Re-seed the form when the project identity changes — even if dirty, stale
  // values must never be saveable into the new project. Render-time state
  // adjustment (not an effect) per the ExportDialog open/prevOpen pattern.
  // The store hydrates the new project's state asynchronously, so seed once at
  // switch time and once more when the hydrated state object lands.
  const [seeded, setSeeded] = useState<{ projectId: string; pendingSince: typeof state | null }>(
    () => ({ projectId: activeProjectId, pendingSince: null }),
  );
  const reseed = seeded.projectId !== activeProjectId
    ? { projectId: activeProjectId, pendingSince: state }
    : seeded.pendingSince && seeded.pendingSince !== state
      ? { projectId: seeded.projectId, pendingSince: null }
      : null;
  if (reseed) {
    setSeeded(reseed);
    setTitle(state.title);
    setSynopsis(state.synopsis);
    setStyleProfile(state.style_profile);
    setAuthorIntent(state.author_intent);
  }

  useUnsavedChanges(
    title !== state.title ||
    synopsis !== state.synopsis ||
    styleProfile !== state.style_profile ||
    authorIntent !== state.author_intent,
  );

  const handleSave = () => {
    setIsSaving(true);
    updateField('title', title);
    updateField('synopsis', synopsis);
    updateField('style_profile', styleProfile);
    updateField('author_intent', authorIntent);
    setTimeout(() => setIsSaving(false), 500);
  };

  const handleExtract = useCallback(async (): Promise<number> => {
    setExtractError(null);
    const validChapters = state.chapters
      .map((ch) => ({ title: ch.title, content: getPlainText(ch.content) }))
      .filter((ch) => ch.title?.trim() && ch.content.trim());

    if (validChapters.length === 0) {
      throw new Error(t('noChaptersError'));
    }

    const res = await fetch('/api/extract-world-bible', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chapters: validChapters }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      const msg = err.error || t('extractionFailed');
      throw new Error(`[HTTP ${res.status}] ${msg}`);
    }
    const data = await res.json();
    const sections: WorldBibleSection[] = data.sections ?? [];
    if (sections.length > 0) {
      setIncomingSections(sections);
      setMergeModalOpen(true);
    }
    return sections.length;
  }, [state.chapters, t]);

  const handleMergeConfirm = useCallback((selected: WorldBibleSection[]) => {
    updateField('world_bible', [...state.world_bible, ...selected]);
    setIncomingSections([]);
  }, [state.world_bible, updateField]);

  const handleUpdateSection = useCallback((updated: WorldBibleSection) => {
    updateField(
      'world_bible',
      state.world_bible.map((s) => (s.id === updated.id ? updated : s)),
    );
  }, [state.world_bible, updateField]);

  const handleDeleteSection = useCallback((id: string) => {
    updateField('world_bible', state.world_bible.filter((s) => s.id !== id));
  }, [state.world_bible, updateField]);

  const handleQueuePromote = useCallback(
    (ids: string[], target: 'flexible' | 'confirmed') => {
      const idSet = new Set(ids);
      const now = new Date().toISOString();
      updateField(
        'world_bible',
        state.world_bible.map(s =>
          idSet.has(s.id)
            ? { ...s, canonStatus: target, lastUpdated: now }
            : s,
        ),
      );
    },
    [state.world_bible, updateField],
  );

  const handleQueueDiscard = useCallback(
    (ids: string[]) => {
      const idSet = new Set(ids);
      const now = new Date().toISOString();
      updateField(
        'world_bible',
        state.world_bible.map(s =>
          idSet.has(s.id)
            ? { ...s, canonStatus: 'discarded' as const, lastUpdated: now }
            : s,
        ),
      );
    },
    [state.world_bible, updateField],
  );

  const handleAddSection = useCallback(() => {
    const newSection: WorldBibleSection = {
      id: crypto.randomUUID(),
      category: selectedCategory,
      title: t('newSection'),
      content: '',
      source: 'user-written',
      lastUpdated: new Date().toISOString(),
      canonStatus: 'draft',
    };
    updateField('world_bible', [...state.world_bible, newSection]);
    toast(t('sectionAddedToast'), 'success');
  }, [selectedCategory, state.world_bible, updateField, t, toast]);

  // G14: a quiet text filter over the open category.
  const [sectionQuery, setSectionQuery] = useState('');
  const categorySections = state.world_bible.filter((s) => {
    if (s.category !== selectedCategory) return false;
    const q = sectionQuery.trim().toLowerCase();
    return !q || s.title.toLowerCase().includes(q) || s.content.toLowerCase().includes(q);
  });

  const categoryCount = (cat: WorldBibleCategory) =>
    state.world_bible.filter((s) => s.category === cat).length;

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-10">
      <CarvedHeader
        title={t('title')}
        subtitle={t('subtitle')}
        actions={
          <div className="flex items-center gap-3">
            <WorldBibleExtractButton
              onExtract={handleExtract}
              chapterCount={state.chapters.length}
              onError={setExtractError}
            />
            {draftCount > 0 && (
              <InkStampButton
                variant="ghost"
                onClick={() => setReviewQueueOpen(true)}
                icon={<AlertTriangle size={16} />}
              >
                {t('reviewDrafts', { count: draftCount })}
              </InkStampButton>
            )}
            <InkStampButton onClick={handleSave} disabled={isSaving} icon={<Save size={18} />}>
              {isSaving ? t('saved') : t('saveChanges')}
            </InkStampButton>
          </div>
        }
      />

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-8"
      >
        {/* Existing core fields */}
        <section className="space-y-4 border-l-4 border-l-brass-500 pl-5">
          <label className="block text-sm font-medium text-sepia-600 uppercase tracking-wider">
            {t('projectTitleLabel')}
          </label>
          <ParchmentInput
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="text-2xl font-serif font-semibold py-4"
            placeholder={t('projectTitlePlaceholder')}
          />
        </section>

        <section className="space-y-4 border-l-4 border-l-forest-700 pl-5">
          <label className="block text-sm font-medium text-sepia-600 uppercase tracking-wider">
            {t('synopsisLabel')}
          </label>
          <ParchmentTextarea
            value={synopsis}
            onChange={(e) => setSynopsis(e.target.value)}
            className="py-4 h-48"
            placeholder={t('synopsisPlaceholder')}
          />
        </section>

        <DecorativeDivider variant="flourish" className="my-6" />

        <section className="space-y-4 border-l-4 border-l-sepia-500 pl-5">
          <label className="flex items-center gap-2 text-sm font-medium text-sepia-600 uppercase tracking-wider">
            <Settings2 size={16} />
            {t('styleLabel')}
          </label>
          <ParchmentTextarea
            value={styleProfile}
            onChange={(e) => setStyleProfile(e.target.value)}
            className="py-4 h-32"
            placeholder={t('stylePlaceholder')}
          />
        </section>

        <section className="space-y-4 border-l-4 border-l-brass-700 pl-5">
          <label className="block text-sm font-medium text-sepia-600 uppercase tracking-wider">
            {t('intentLabel')}
          </label>
          <ParchmentTextarea
            value={authorIntent}
            onChange={(e) => setAuthorIntent(e.target.value)}
            className="py-4 h-32"
            placeholder={t('intentPlaceholder')}
          />
          <p className="text-xs text-sepia-600">{t('intentHint')}</p>
        </section>
      </motion.div>

      <DecorativeDivider variant="flourish" className="my-6" />

      {/* World Bible Section */}
      <FeatureErrorBoundary title={t('worldBibleHeading')}>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <h2 className="text-xl font-serif font-semibold text-parchment-200 mb-4">{t('worldBibleHeading')}</h2>

          {extractError && (
            <div
              role="alert"
              className="mb-4 flex items-start gap-3 rounded-lg border border-wax-700/30 bg-wax-500/10 p-4 text-sm text-wax-900"
            >
              <AlertTriangle size={18} className="mt-0.5 shrink-0 text-wax-800" />
              <div className="flex-1">
                <p className="font-semibold">{t('extractionFailed')}</p>
                <p className="mt-1 whitespace-pre-wrap text-wax-900/90">{extractError}</p>
              </div>
              <button
                type="button"
                onClick={() => setExtractError(null)}
                aria-label={t('dismissError')}
                className="shrink-0 rounded-full p-1 text-wax-800 hover:bg-wax-500/10"
              >
                <X size={16} />
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
            {/* Category sidebar */}
            <div className="space-y-1">
              {WORLD_BIBLE_CATEGORIES.map((cat) => {
                const Icon = CATEGORY_ICONS[cat];
                const count = categoryCount(cat);
                const isActive = cat === selectedCategory;

                return (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={[
                      'w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-left transition-colors text-sm',
                      isActive
                        ? 'bg-parchment-200 border border-brass-500/40 text-sepia-900 font-semibold'
                        : 'text-sepia-600 hover:bg-parchment-200/50 border border-transparent',
                    ].join(' ')}
                  >
                    <Icon size={16} className={isActive ? 'text-brass-700' : 'text-sepia-600'} />
                    <span className="flex-1">{t(`category.${cat}`)}</span>
                    {count > 0 && (
                      <span className={[
                        'text-xs px-1.5 py-0.5 rounded-full',
                        isActive ? 'bg-brass-500/20 text-brass-800' : 'bg-sepia-300/30 text-sepia-600',
                      ].join(' ')}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Category content */}
            <div className="space-y-4">
              {/* G14: filter the open category by title or content */}
              <ParchmentInput
                value={sectionQuery}
                onChange={(e) => setSectionQuery(e.target.value)}
                placeholder={t('filterPlaceholder')}
                aria-label={t('filterPlaceholder')}
              />
              {categorySections.length === 0 ? (
                <ParchmentCard padding="lg">
                  <EmptyState
                    variant="bible"
                    title={t('noEntries', { category: t(`category.${selectedCategory}`).toLowerCase() })}
                    subtitle={t('emptySubtitle')}
                  />
                </ParchmentCard>
              ) : (
                categorySections.map((section, index) => (
                  // M13: bible entries are dealt onto the desk in order.
                  <motion.div key={section.id} {...stagger.cards(Math.min(index, 8))}>
                    <WorldBibleSectionCard
                      section={section}
                      onUpdate={handleUpdateSection}
                      onDelete={handleDeleteSection}
                    />
                  </motion.div>
                ))
              )}

              <InkStampButton
                variant="ghost"
                size="sm"
                icon={<Plus size={16} />}
                onClick={handleAddSection}
              >
                {t('addSection')}
              </InkStampButton>
            </div>
          </div>
        </motion.div>
      </FeatureErrorBoundary>

      {/* Merge Modal */}
      <WorldBibleMergeModal
        open={mergeModalOpen}
        onClose={() => setMergeModalOpen(false)}
        incoming={incomingSections}
        existing={state.world_bible}
        onConfirm={handleMergeConfirm}
      />

      {/* Draft Review Queue (CB-05 / Phase 4.8) */}
      <WorldBibleReviewQueue
        open={reviewQueueOpen}
        onClose={() => setReviewQueueOpen(false)}
        sections={state.world_bible}
        onPromote={handleQueuePromote}
        onDiscard={handleQueueDiscard}
      />
    </div>
  );
}
