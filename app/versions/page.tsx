'use client';

import { useEffect, useState, useCallback } from 'react';
import { Save, RotateCcw, Trash2, Clock } from 'lucide-react';
import { useStory } from '@/lib/store';
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

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(ts).toLocaleDateString();
}

function formatDelta(n: number, label: string): string | null {
  if (n === 0) return null;
  const sign = n > 0 ? '+' : '−';
  return `${sign}${Math.abs(n).toLocaleString()} ${label}`;
}

export default function VersionsPage() {
  const { state, setState } = useStory();
  const { confirm } = useConfirm();
  const { toast } = useToast();

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
        name: name.trim() || `Snapshot ${new Date().toLocaleString()}`,
        description: description.trim(),
      });
      setName('');
      setDescription('');
      await refresh();
      toast(`Saved snapshot "${meta.name}".`, 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save snapshot';
      toast(msg, 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleRestore = async (snap: SnapshotMetadata) => {
    const full = await getSnapshot(snap.id);
    if (!full) {
      toast('Snapshot is corrupted; cannot restore.', 'error');
      return;
    }
    const delta = computeDelta(snap, state);
    const summary = [
      formatDelta(-delta.chapterDelta, `chapter${Math.abs(delta.chapterDelta) === 1 ? '' : 's'}`),
      formatDelta(-delta.wordDelta, 'words'),
      formatDelta(-delta.characterDelta, `character${Math.abs(delta.characterDelta) === 1 ? '' : 's'}`),
      formatDelta(-delta.worldBibleDelta, 'world bible entries'),
    ].filter(Boolean);
    const message =
      `Restoring "${snap.name}" will replace your current state with the snapshot from ` +
      `${new Date(snap.createdAt).toLocaleString()}. ` +
      (summary.length === 0
        ? 'The snapshot is identical in size to your current work.'
        : `Net change vs current: ${summary.join(', ')}.`);

    const ok = await confirm({
      title: 'Restore snapshot?',
      message,
      confirmLabel: 'Restore',
      variant: 'danger',
    });
    if (!ok) return;

    setState(full.payload);
    toast(`Restored "${snap.name}".`, 'success');
  };

  const handleDelete = async (snap: SnapshotMetadata) => {
    const ok = await confirm({
      title: 'Delete snapshot?',
      message: `Remove "${snap.name}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;
    await deleteSnapshot(snap.id);
    await refresh();
  };

  return (
    <FeatureErrorBoundary title="Versions">
      <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-8">
        <CarvedHeader
          title="Versions"
          subtitle="Frozen copies of your entire story. Restore one to roll back to a known-good state."
          icon={<Clock size={24} />}
        />

        {/* Save snapshot card */}
        <ParchmentCard className="space-y-4">
          <h2 className="text-lg font-serif font-semibold text-sepia-900 flex items-center gap-2">
            <Save size={18} className="text-brass-500" />
            Save a snapshot
          </h2>
          <p className="text-sepia-600 text-sm leading-relaxed">
            Snapshots are stored on this device. Up to{' '}
            <span className="font-mono">{DEFAULT_SNAPSHOT_CAP}</span> are kept; the oldest are
            pruned automatically.
          </p>
          <div className="space-y-3">
            <ParchmentInput
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder='e.g. "Before chapter 12 rewrite"'
              aria-label="Snapshot name"
            />
            <ParchmentTextarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="h-20"
              placeholder="Optional: what changed since the last save?"
              aria-label="Snapshot description"
            />
            <InkStampButton onClick={handleCreate} disabled={creating} icon={<Save size={16} />}>
              {creating ? 'Saving…' : 'Save snapshot'}
            </InkStampButton>
          </div>
        </ParchmentCard>

        {/* List */}
        <section aria-label="Saved snapshots" className="space-y-3">
          <h2 className="text-lg font-serif font-semibold text-sepia-900">
            Saved snapshots
            {snapshots && (
              <span className="ml-2 text-xs font-mono text-sepia-600">
                {snapshots.length} of {DEFAULT_SNAPSHOT_CAP}
              </span>
            )}
          </h2>

          {snapshots === null && (
            <p className="text-sm text-sepia-600 italic">Loading…</p>
          )}

          {snapshots && snapshots.length === 0 && (
            <ParchmentCard padding="lg">
              <EmptyState
                variant="manuscript"
                title="No snapshots yet"
                subtitle="Save your first snapshot above before risky edits."
              />
            </ParchmentCard>
          )}

          {snapshots?.map(snap => (
            <ParchmentCard key={snap.id} padding="md">
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
                    <span>{snap.chapterCount.toLocaleString()} chapter{snap.chapterCount === 1 ? '' : 's'}</span>
                    <span>·</span>
                    <span>{snap.wordCount.toLocaleString()} words</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <InkStampButton
                    variant="ghost"
                    size="sm"
                    icon={<RotateCcw size={14} />}
                    onClick={() => handleRestore(snap)}
                  >
                    Restore
                  </InkStampButton>
                  <button
                    type="button"
                    onClick={() => handleDelete(snap)}
                    className="p-2 rounded-md text-sepia-600 hover:text-wax-600 hover:bg-wax-500/10 transition-colors"
                    aria-label={`Delete snapshot ${snap.name}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </ParchmentCard>
          ))}
        </section>
      </div>
    </FeatureErrorBoundary>
  );
}
