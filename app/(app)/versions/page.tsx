'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { AnimatePresence, motion } from 'motion/react';
import { springs, strikeFade, strikeLine } from '@/lib/animations';
import { Save, RotateCcw, Trash2 } from 'lucide-react';
import { useStory, defaultState } from '@/lib/store';
import {
  createSnapshot,
  listSnapshots,
  getSnapshot,
  deleteSnapshot,
  computeDelta,
  DEFAULT_SNAPSHOT_CAP,
  type SnapshotMetadata,
} from '@/lib/snapshot';
import {
  CarvedHeader,
  ParchmentCard,
  ParchmentInput,
  ParchmentTextarea,
  InkStampButton,
  EmptyState,
  FeatureErrorBoundary,
} from '@/components/antiquarian';
import { useConfirm } from '@/components/antiquarian/parchment-modal';
import { useToast } from '@/components/toast';

export default function VersionsPage() {
  const t = useTranslations('versions');
  const tCommon = useTranslations('common');
  const { state, setState } = useStory();
  const { confirm } = useConfirm();
  const { toast } = useToast();

  const formatRelative = useCallback((ts: number): string => {
    const diff = Date.now() - ts;
    const min = Math.floor(diff / 60_000);
    if (min < 1) return t('time.justNow');
    if (min < 60) return t('time.minutes', { count: min });
    const hr = Math.floor(min / 60);
    if (hr < 24) return t('time.hours', { count: hr });
    const d = Math.floor(hr / 24);
    if (d < 30) return t('time.days', { count: d });
    return new Date(ts).toLocaleDateString();
  }, [t]);

  // Build a signed delta string like "+5 chapters" / "−1,200 words"; null when zero.
  const formatDelta = useCallback((n: number, nounKey: 'chapters' | 'words' | 'characters' | 'worldBible'): string | null => {
    if (n === 0) return null;
    const sign = n > 0 ? '+' : '−';
    const abs = Math.abs(n);
    return `${sign}${abs.toLocaleString()} ${t(`deltaNoun.${nounKey}`, { count: abs })}`;
  }, [t]);

  const [snapshots, setSnapshots] = useState<SnapshotMetadata[] | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    setSnapshots(await listSnapshots());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const meta = await createSnapshot(state, {
        name: name.trim() || t('snapDefaultName', { date: new Date().toLocaleString() }),
        description: description.trim(),
      });
      setName('');
      setDescription('');
      await refresh();
      toast(t('toastSaved', { name: meta.name }), 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('toastSaveError');
      toast(msg, 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleRestore = async (snap: SnapshotMetadata) => {
    let full: Awaited<ReturnType<typeof getSnapshot>>;
    try {
      full = await getSnapshot(snap.id);
    } catch {
      toast(t('toastRestoreError'), 'error');
      return;
    }
    if (!full) {
      toast(t('toastCorrupted'), 'error');
      return;
    }
    const delta = computeDelta(snap, state);
    const summary = [
      formatDelta(-delta.chapterDelta, 'chapters'),
      formatDelta(-delta.wordDelta, 'words'),
      formatDelta(-delta.characterDelta, 'characters'),
      formatDelta(-delta.worldBibleDelta, 'worldBible'),
    ].filter(Boolean);
    const detail = summary.length === 0
      ? t('restoreSameSize')
      : t('restoreNetChange', { summary: summary.join(', ') });
    const message = t('restoreMessage', {
      name: snap.name,
      date: new Date(snap.createdAt).toLocaleString(),
      detail,
    });

    const ok = await confirm({
      title: t('restoreTitle'),
      message,
      confirmLabel: t('restoreConfirm'),
      variant: 'danger',
    });
    if (!ok) return;

    // Spread over defaultState so snapshots taken before newer StoryState
    // fields existed (e.g. author_name, world_bible) restore with defaults
    // instead of leaving those fields undefined until the next reload.
    setState({ ...defaultState, ...full.payload });
    toast(t('toastRestored', { name: snap.name }), 'success');
  };

  const handleDelete = async (snap: SnapshotMetadata) => {
    const ok = await confirm({
      title: t('deleteTitle'),
      message: t('deleteMessage', { name: snap.name }),
      confirmLabel: tCommon('delete'),
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await deleteSnapshot(snap.id);
      await refresh();
    } catch {
      toast(t('toastDeleteError'), 'error');
    }
  };

  return (
    <FeatureErrorBoundary title={t('title')}>
      <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-8">
        <CarvedHeader
          title={t('title')}
          subtitle={t('subtitle')}
        />

        {/* Save snapshot card */}
        <ParchmentCard className="space-y-4">
          <h2 className="text-lg font-serif font-semibold text-sepia-900 flex items-center gap-2">
            <Save size={18} className="text-brass-500" />
            {t('saveHeading')}
          </h2>
          <p className="text-sepia-600 text-sm leading-relaxed">
            {t.rich('capNote', {
              count: DEFAULT_SNAPSHOT_CAP,
              cap: (chunks) => <span className="font-mono">{chunks}</span>,
            })}
          </p>
          <div className="space-y-3">
            <ParchmentInput
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={t('namePlaceholder')}
              aria-label={t('nameLabel')}
            />
            <ParchmentTextarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="h-20"
              placeholder={t('descPlaceholder')}
              aria-label={t('descLabel')}
            />
            <InkStampButton onClick={handleCreate} disabled={creating} icon={<Save size={16} />}>
              {creating ? t('saving') : t('saveBtn')}
            </InkStampButton>
          </div>
        </ParchmentCard>

        {/* List */}
        <section aria-label={t('listHeading')} className="space-y-3">
          <h2 className="text-lg font-serif font-semibold text-parchment-200">
            {t('listHeading')}
            {snapshots && (
              <span className="ml-2 text-xs font-mono text-sepia-400">
                {t('listCount', { count: snapshots.length, cap: DEFAULT_SNAPSHOT_CAP })}
              </span>
            )}
          </h2>

          {snapshots === null && (
            <div className="space-y-3 animate-pulse" aria-label={t('loading')}>
              {[0, 1].map(i => (
                <ParchmentCard key={i} padding="md">
                  <div className="space-y-2">
                    <div className="h-4 w-1/3 rounded bg-sepia-300/40" />
                    <div className="h-3 w-2/3 rounded bg-sepia-300/30" />
                    <div className="h-3 w-1/2 rounded bg-sepia-300/20" />
                  </div>
                </ParchmentCard>
              ))}
            </div>
          )}

          {snapshots && snapshots.length === 0 && (
            <ParchmentCard padding="lg">
              <EmptyState
                variant="manuscript"
                title={t('emptyTitle')}
                subtitle={t('emptySubtitle')}
              />
            </ParchmentCard>
          )}

          <AnimatePresence initial={false}>
          {snapshots?.map(snap => (
            <motion.div
              key={snap.id}
              layout
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={strikeFade.exit}
              transition={springs.gentle}
              className="relative"
            >
            {/* M16: the record is struck through in ink before it fades */}
            <motion.div
              aria-hidden="true"
              {...strikeLine}
              className="pointer-events-none absolute left-5 right-5 top-1/2 z-10 h-[2px] origin-left rounded-full bg-sepia-700/80"
            />
            <ParchmentCard padding="md" hover>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="font-serif font-semibold text-sepia-900">{snap.name}</p>
                  {snap.description && (
                    <p className="text-sm text-sepia-600 mt-1">{snap.description}</p>
                  )}
                  <div className="mt-2 flex items-center gap-3 text-xs text-sepia-600 font-mono flex-wrap">
                    <span title={new Date(snap.createdAt).toLocaleString()}>
                      {formatRelative(snap.createdAt)}
                    </span>
                    <span>·</span>
                    <span>{t('snapChapters', { count: snap.chapterCount })}</span>
                    <span>·</span>
                    <span>{t('snapWords', { count: snap.wordCount })}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <InkStampButton
                    variant="ghost"
                    size="sm"
                    icon={<RotateCcw size={14} />}
                    onClick={() => handleRestore(snap)}
                  >
                    {t('restore')}
                  </InkStampButton>
                  <button
                    type="button"
                    onClick={() => handleDelete(snap)}
                    className="p-2 rounded-md text-sepia-600 hover:text-wax-600 hover:bg-wax-500/10 transition-colors"
                    aria-label={t('deleteAria', { name: snap.name })}
                    title={t('deleteAria', { name: snap.name })}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </ParchmentCard>
            </motion.div>
          ))}
          </AnimatePresence>
        </section>
      </div>
    </FeatureErrorBoundary>
  );
}
