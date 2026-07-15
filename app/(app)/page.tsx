'use client';

import React, { Suspense } from 'react';
import { useTranslations } from 'next-intl';
import { useStory } from '@/lib/store';
import { useSession } from '@/lib/session';
import { wordCount as countWords } from '@/lib/editor/serialization';
import { motion } from 'motion/react';
import { BookOpen, Users, Clock, Swords, AlertCircle, Flame, BrainCircuit } from 'lucide-react';
import Link from 'next/link';
import { stagger, hoverLift, physicalDrop, fadeUp } from '@/lib/animations';
import {
  CarvedHeader,
  ParchmentCard,
  EmptyState,
  CharacterAvatar,
  DecorativeDivider,
  FeatureErrorBoundary,
  AnimatedNumber,
  Reveal,
} from '@/components/antiquarian';
import { GenesisGuard } from '@/components/genesis/genesis-guard';
import { useGamification } from '@/hooks/use-gamification';
import { useNovelCompletion } from '@/hooks/use-novel-completion';
import NovelCompletionRitual from '@/components/completion/NovelCompletionRitual';

const DashboardGamification = React.lazy(() => import('@/components/gamification/dashboard-gamification').then(m => ({ default: m.DashboardGamification })));

const BLOCK_TYPES = ['fear', 'perfectionism', 'direction', 'exhaustion'] as const;

// ─── Inline SVG: Animated Candle ───
function CandleIcon() {
  return (
    <svg viewBox="0 0 24 40" className="w-6 h-10 shrink-0" fill="none">
      <rect x="8" y="16" width="8" height="20" rx="1.5" fill="#c49b48" opacity="0.6" />
      <rect x="9" y="14" width="6" height="4" rx="1" fill="#a88540" opacity="0.5" />
      <line x1="12" y1="14" x2="12" y2="10" stroke="#5a3d1e" strokeWidth="0.8" />
      <ellipse cx="12" cy="8" rx="3" ry="5" fill="#c49b48" opacity="0.5">
        <animate attributeName="ry" values="5;4;5.5;4.5;5" dur="2s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.5;0.7;0.4;0.6;0.5" dur="2s" repeatCount="indefinite" />
      </ellipse>
      <ellipse cx="12" cy="7" rx="1.5" ry="2.5" fill="#f0dfc0" opacity="0.6">
        <animate attributeName="ry" values="2.5;2;3;2;2.5" dur="1.5s" repeatCount="indefinite" />
      </ellipse>
    </svg>
  );
}

// ─── Thread SVG for open loops ───
function ThreadWisp() {
  return (
    <svg viewBox="0 0 20 12" className="w-5 h-3 shrink-0 mt-1.5" fill="none">
      <path d="M2 6 Q6 2 10 6 Q14 10 18 6" stroke="#c49b48" strokeWidth="1.2" strokeLinecap="round" opacity="0.5" />
    </svg>
  );
}

// ─── Story Anatomy Bar ───
function StoryAnatomyBar({ chapters, characters, events, conflicts }: {
  chapters: number; characters: number; events: number; conflicts: number;
}) {
  const t = useTranslations('dashboard');
  const total = chapters + characters + events + conflicts;
  if (total === 0) return null;

  const segments = [
    { count: chapters, color: 'bg-forest-700', label: t('anatomy.chapters'), href: '/manuscript' },
    { count: characters, color: 'bg-brass-600', label: t('anatomy.characters'), href: '/characters' },
    { count: events, color: 'bg-sepia-500', label: t('anatomy.timeline'), href: '/timeline' },
    { count: conflicts, color: 'bg-wax-600', label: t('anatomy.conflicts'), href: '/conflicts' },
  ].filter(s => s.count > 0);

  return (
    <motion.div {...fadeUp}>
      <div className="flex items-center gap-3 mb-3">
        <Flame aria-hidden="true" size={16} className="text-brass-600" />
        <h2 className="text-sm font-serif font-semibold text-sepia-700 uppercase tracking-wider">{t('anatomy.heading')}</h2>
        <DecorativeDivider variant="section" className="flex-1" />
      </div>
      <div className="flex h-3 rounded-full overflow-hidden bg-parchment-200/50 border border-sepia-300/20">
        {segments.map((seg) => (
          <Link
            key={seg.label}
            href={seg.href}
            className={`${seg.color} transition-[filter] hover:brightness-110 relative group`}
            style={{ width: `${(seg.count / total) * 100}%` }}
            title={`${seg.label}: ${seg.count}`}
          >
            <span className="sr-only">{seg.label}: {seg.count}</span>
          </Link>
        ))}
      </div>
      <div className="flex gap-4 mt-2">
        {segments.map((seg) => (
          <div key={seg.label} className="flex items-center gap-1.5 text-[10px] text-sepia-600">
            <span className={`w-2 h-2 rounded-full ${seg.color}`} />
            {seg.label}
          </div>
        ))}
      </div>
    </motion.div>
  );
}

// ─── Story Health Card ───
function StoryHealthCard() {
  const t = useTranslations('dashboard');
  // Lazy import analysis modules to avoid bloating the dashboard bundle.
  // Modules are loaded in parallel (not waterfall) and cancelled on unmount.
  const [counts, setCounts] = React.useState<{ unresolved: number; plotHoles: number } | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [
          { analyzeStoryState },
          { detectInconsistencies },
          { detectPlotHoles },
          { getResolutions },
          { getStory },
        ] = await Promise.all([
          import('@/lib/story-brain/analyzer'),
          import('@/lib/story-brain/inconsistency-detector'),
          import('@/lib/story-brain/plot-hole-detector'),
          import('@/lib/story-brain/resolutions'),
          import('@/lib/storage/dexie-db'),
        ]);
        if (cancelled) return;
        // Access state from Dexie for dashboard summary (no chapter contents needed)
        const raw = await getStory();
        if (!raw) return;
        if (cancelled) return;
        const state = raw as unknown as import('@/lib/store').StoryState;
        const analysis = analyzeStoryState(state);
        const incs = detectInconsistencies(state, analysis);
        const phs = detectPlotHoles(state, analysis);
        const resolved = new Set(getResolutions().map(r => r.inconsistencyId));
        if (cancelled) return;
        setCounts({
          unresolved: incs.filter(i => !resolved.has(i.id)).length,
          plotHoles: phs.filter(p => !resolved.has(p.id)).length,
        });
      } catch {
        // Silently swallow — dashboard summary is non-critical.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (!counts || (counts.unresolved === 0 && counts.plotHoles === 0)) return null;
  const total = counts.unresolved + counts.plotHoles;

  return (
    <Link href="/story-brain">
      <motion.div {...fadeUp} {...hoverLift}>
        <ParchmentCard padding="lg" hover className="cursor-pointer border-l-4 border-l-wax-500">
          <div className="flex items-center gap-3">
            <BrainCircuit aria-hidden="true" size={20} className="text-wax-500 shrink-0" />
            <div>
              <p className="text-sm font-medium text-sepia-800">
                {t('health.issues', { count: total })}
              </p>
              <p className="text-[10px] text-sepia-600 mt-0.5">
                {counts.unresolved > 0 && t('health.inconsistencies', { count: counts.unresolved })}
                {counts.unresolved > 0 && counts.plotHoles > 0 && ' · '}
                {counts.plotHoles > 0 && t('health.plotHoles', { count: counts.plotHoles })}
              </p>
            </div>
          </div>
        </ParchmentCard>
      </motion.div>
    </Link>
  );
}

// ─── Gamification Skeleton ───
function GamificationSkeleton() {
  return (
    <ParchmentCard padding="lg">
      <div className="animate-pulse space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-parchment-300/40" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-32 bg-parchment-300/40 rounded" />
            <div className="h-2 w-48 bg-parchment-300/30 rounded" />
          </div>
        </div>
        <div className="h-2 w-full bg-parchment-300/30 rounded-full" />
      </div>
    </ParchmentCard>
  );
}

// ─── Canon Status Colors ───
const canonColors: Record<string, string> = {
  confirmed: 'border-l-forest-700',
  flexible: 'border-l-brass-600',
  draft: 'border-l-sepia-500',
  discarded: 'border-l-wax-600',
};

export default function Dashboard() {
  const t = useTranslations('dashboard');
  const { state } = useStory();
  const { session } = useSession();
  const { finishing, isLoaded } = useGamification();
  const { novelJustCompleted, completionStats, dismissCompletion } = useNovelCompletion(finishing, isLoaded);

  const totalWords = state.chapters.reduce(
    (sum, ch) => sum + (ch.content ? countWords(ch.content) : 0),
    0
  );
  const activeConflicts = state.active_conflicts.filter(c => c.status === 'active').length;
  const resolvedConflicts = state.active_conflicts.filter(c => c.status === 'resolved').length;

  const blockType = session.blockType && (BLOCK_TYPES as readonly string[]).includes(session.blockType)
    ? session.blockType
    : null;
  const blockMsg = blockType
    ? { headline: t(`block.${blockType}Headline`), nudge: t(`block.${blockType}Nudge`) }
    : null;

  return (
    <GenesisGuard>
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      <CarvedHeader
        title={state.title || t('untitled')}
        subtitle={state.synopsis || t('noSynopsis')}
      />

      {/* Writer's Block Message */}
      {blockMsg && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          data-testid="block-message"
        >
          <ParchmentCard variant="inset" padding="lg" className="border-l-4 border-l-brass-500">
            <div className="flex items-start gap-4">
              <CandleIcon />
              <div>
                <p className="text-xl font-serif text-sepia-900">{blockMsg.headline}</p>
                <p className="text-sm text-sepia-600 mt-2 italic">{blockMsg.nudge}</p>
              </div>
            </div>
          </ParchmentCard>
        </motion.div>
      )}

      {/* ── Stat Cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Chapters Card */}
        <Link href="/manuscript">
          <motion.div {...stagger.cards(0)} {...hoverLift}>
            <ParchmentCard padding="lg" hover className="group cursor-pointer">
              <div className="flex items-center justify-between mb-3">
                <BookOpen aria-hidden="true" className="text-brass-600 group-hover:text-brass-500 transition-colors" size={22} />
                <AnimatedNumber value={state.chapters.length} className="text-3xl font-light text-sepia-900" />
              </div>
              <h3 className="text-xs font-medium text-sepia-600 uppercase tracking-wider">{t('stats.chapters')}</h3>
              {totalWords > 0 && (
                <p className="text-[10px] font-mono text-sepia-600 mt-1">{t('stats.words', { count: totalWords.toLocaleString() })}</p>
              )}
            </ParchmentCard>
          </motion.div>
        </Link>

        {/* Characters Card */}
        <Link href="/characters">
          <motion.div {...stagger.cards(1)} {...hoverLift}>
            <ParchmentCard padding="lg" hover className="group cursor-pointer">
              <div className="flex items-center justify-between mb-3">
                <Users aria-hidden="true" className="text-brass-600 group-hover:text-brass-500 transition-colors" size={22} />
                <AnimatedNumber value={state.characters.length} className="text-3xl font-light text-sepia-900" />
              </div>
              <h3 className="text-xs font-medium text-sepia-600 uppercase tracking-wider">{t('stats.characters')}</h3>
              {state.characters.length > 0 && (
                <div className="flex items-center mt-2 -space-x-2">
                  {state.characters.slice(0, 4).map((c) => (
                    <CharacterAvatar key={c.id} name={c.name} size="sm" indicator={c.currentState?.indicator} />
                  ))}
                  {state.characters.length > 4 && (
                    <span className="text-[10px] font-mono text-sepia-600 ml-2">+{state.characters.length - 4}</span>
                  )}
                </div>
              )}
            </ParchmentCard>
          </motion.div>
        </Link>

        {/* Timeline Card */}
        <Link href="/timeline">
          <motion.div {...stagger.cards(2)} {...hoverLift}>
            <ParchmentCard padding="lg" hover className="group cursor-pointer">
              <div className="flex items-center justify-between mb-3">
                <Clock aria-hidden="true" className="text-brass-600 group-hover:text-brass-500 transition-colors" size={22} />
                <AnimatedNumber value={state.timeline_events.length} className="text-3xl font-light text-sepia-900" />
              </div>
              <h3 className="text-xs font-medium text-sepia-600 uppercase tracking-wider">{t('stats.timelineEvents')}</h3>
              {state.timeline_events.length > 0 && (
                <div className="flex items-center gap-1 mt-2">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="flex items-center gap-1">
                      <span className={`w-2 h-2 rounded-full ${i < state.timeline_events.length ? 'bg-brass-500' : 'bg-sepia-300/30'}`} />
                      {i < 2 && <span className="w-3 h-px bg-sepia-300/40" />}
                    </span>
                  ))}
                  {state.timeline_events.length > 0 && (
                    <span className="text-[10px] font-mono text-sepia-600 ml-1">
                      {state.timeline_events[0]?.date || ''}
                    </span>
                  )}
                </div>
              )}
            </ParchmentCard>
          </motion.div>
        </Link>

        {/* Conflicts Card */}
        <Link href="/conflicts">
          <motion.div {...stagger.cards(3)} {...hoverLift}>
            <ParchmentCard padding="lg" hover className="group cursor-pointer">
              <div className="flex items-center justify-between mb-3">
                <Swords aria-hidden="true" className="text-brass-600 group-hover:text-brass-500 transition-colors" size={22} />
                <AnimatedNumber value={state.active_conflicts.length} className="text-3xl font-light text-sepia-900" />
              </div>
              <h3 className="text-xs font-medium text-sepia-600 uppercase tracking-wider">{t('stats.conflicts')}</h3>
              {state.active_conflicts.length > 0 && (
                <div className="flex items-center gap-2 mt-2">
                  <div className="flex h-1.5 flex-1 rounded-full overflow-hidden bg-sepia-300/20">
                    {activeConflicts > 0 && (
                      <div
                        className="bg-wax-500 rounded-l-full"
                        style={{ width: `${(activeConflicts / state.active_conflicts.length) * 100}%` }}
                      />
                    )}
                    {resolvedConflicts > 0 && (
                      <div
                        className="bg-forest-600"
                        style={{ width: `${(resolvedConflicts / state.active_conflicts.length) * 100}%` }}
                      />
                    )}
                  </div>
                  <span className="text-[10px] font-mono text-sepia-600">{t('stats.conflictRatio', { active: activeConflicts, resolved: resolvedConflicts })}</span>
                </div>
              )}
            </ParchmentCard>
          </motion.div>
        </Link>
      </div>

      {/* ── Gamification ── */}
      <FeatureErrorBoundary title={t('gamificationTitle')}>
        <Suspense fallback={<GamificationSkeleton />}>
          <DashboardGamification />
        </Suspense>
      </FeatureErrorBoundary>

      {/* ── Story Health ── */}
      <FeatureErrorBoundary title={t('health.boundaryTitle')}>
        <StoryHealthCard />
      </FeatureErrorBoundary>

      {/* ── Story Anatomy ── */}
      <StoryAnatomyBar
        chapters={state.chapters.length}
        characters={state.characters.length}
        events={state.timeline_events.length}
        conflicts={state.active_conflicts.length}
      />

      {/* ── Recent Chapters & Open Loops — reveal on scroll (below the fold) ── */}
      <Reveal className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center gap-3">
            <BookOpen size={18} className="text-brass-600" />
            <h2 className="text-lg font-serif font-semibold text-sepia-900">{t('recentChapters')}</h2>
            <DecorativeDivider variant="section" className="flex-1" />
          </div>
          {state.chapters.length === 0 ? (
            <EmptyState
              variant="manuscript"
              title={t('emptyChaptersTitle')}
              subtitle={t('emptyChaptersSubtitle')}
              action={{ label: t('startWriting'), href: '/manuscript' }}
            />
          ) : (
            <div className="space-y-3">
              {state.chapters.slice(-3).reverse().map((chapter, i) => {
                const wordCount = chapter.content ? countWords(chapter.content) : 0;
                const statusColor = canonColors[chapter.canonStatus || 'draft'] || 'border-l-sepia-500';
                return (
                  <motion.div key={chapter.id} {...physicalDrop}>
                    <ParchmentCard className={`border-l-4 ${statusColor}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0">
                          <span className="shrink-0 w-7 h-7 rounded-full bg-brass-500/15 flex items-center justify-center text-xs font-mono text-brass-700">
                            {state.chapters.length - i}
                          </span>
                          <div className="min-w-0">
                            <h3 className="font-medium text-sepia-800 truncate">{chapter.title}</h3>
                            <p className="text-sm text-sepia-600 mt-1 line-clamp-2">{chapter.summary}</p>
                          </div>
                        </div>
                        {wordCount > 0 && (
                          <span className="shrink-0 text-[10px] font-mono text-sepia-600 bg-parchment-200/60 px-2 py-0.5 rounded">
                            {wordCount.toLocaleString()}w
                          </span>
                        )}
                      </div>
                    </ParchmentCard>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <AlertCircle size={18} className="text-brass-600" />
            <h2 className="text-lg font-serif font-semibold text-sepia-900">{t('openLoops')}</h2>
            <DecorativeDivider variant="section" className="flex-1" />
          </div>
          {state.open_loops.filter(l => l.status === 'open').length === 0 ? (
            <EmptyState
              variant="loops"
              title={t('emptyLoopsTitle')}
              subtitle={t('emptyLoopsSubtitle')}
            />
          ) : (
            <div className="space-y-3">
              {state.open_loops.filter(l => l.status === 'open').slice(0, 5).map((loop) => (
                <ParchmentCard key={loop.id} padding="sm" className="flex items-start gap-2">
                  <ThreadWisp />
                  <p className="text-sm text-sepia-700 leading-relaxed">{loop.description}</p>
                </ParchmentCard>
              ))}
            </div>
          )}
        </div>
      </Reveal>
    </div>
    {novelJustCompleted && completionStats && (
      <NovelCompletionRitual stats={completionStats} onDismiss={dismissCompletion} />
    )}
    </GenesisGuard>
  );
}
