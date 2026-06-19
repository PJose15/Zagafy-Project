'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import { Plus, Pencil, Trash2, BookOpen, Check, X, FileText } from 'lucide-react';
import { stagger, hoverLift } from '@/lib/animations';
import {
  CarvedHeader,
  ParchmentCard,
  ParchmentInput,
  InkStampButton,
  EmptyState,
  useConfirm,
  useToast,
} from '@/components/antiquarian';
import { useProjects } from '@/hooks/use-projects';
import {
  createProject,
  renameProject,
  deleteProject,
  switchProject,
  type ProjectSummary,
} from '@/lib/projects/projects';

const statusDot: Record<string, string> = {
  draft: 'bg-sepia-500',
  editing: 'bg-brass-500',
  complete: 'bg-forest-600',
};

function relativeTime(ms: number): string {
  if (!ms) return 'never';
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

export default function ProjectsPage() {
  const router = useRouter();
  const { projects, activeId, loading, refresh } = useProjects();
  const { confirm } = useConfirm();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');

  const openProject = (id: string) => {
    if (id !== activeId) switchProject(id);
    router.push('/');
  };

  const handleCreate = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await createProject('Untitled Project');
      toast('New project created.', 'success');
      router.push('/');
    } catch {
      toast('Could not create the project.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const startRename = (p: ProjectSummary) => {
    setEditingId(p.id);
    setDraftTitle(p.title);
  };

  const saveRename = async (id: string) => {
    const title = draftTitle.trim();
    setEditingId(null);
    if (!title) return;
    await renameProject(id, title);
    await refresh();
  };

  const handleDelete = async (p: ProjectSummary) => {
    const ok = await confirm({
      title: 'Delete project',
      message: `Delete "${p.title}" and all its chapters, characters, history, and stats? This cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;
    await deleteProject(p.id);
    await refresh();
    toast('Project deleted.', 'info');
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <CarvedHeader
          title="Your Stories"
          subtitle="Every project keeps its own manuscript, characters, history, and writing stats."
        />
        <InkStampButton
          variant="primary"
          size="md"
          icon={<Plus size={16} />}
          onClick={handleCreate}
          loading={busy}
        >
          New project
        </InkStampButton>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[0, 1, 2].map(i => (
            <ParchmentCard key={i} padding="lg">
              <div className="animate-pulse space-y-3">
                <div className="h-4 w-2/3 bg-parchment-300/40 rounded" />
                <div className="h-2 w-1/2 bg-parchment-300/30 rounded" />
              </div>
            </ParchmentCard>
          ))}
        </div>
      ) : projects.length === 0 ? (
        <EmptyState
          variant="manuscript"
          title="No projects yet"
          subtitle="Create your first story to begin."
          action={{ label: 'New project', onClick: handleCreate }}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((p, i) => {
            const isActive = p.id === activeId;
            const isEditing = editingId === p.id;
            return (
              <motion.div key={p.id} {...stagger.cards(i)} {...hoverLift}>
                <ParchmentCard
                  padding="lg"
                  className={`relative flex flex-col gap-3 h-full ${isActive ? 'border-l-4 border-l-brass-500' : ''}`}
                >
                  {isActive && (
                    <span className="absolute top-3 right-3 text-[10px] font-mono uppercase tracking-wider text-brass-700">
                      Active
                    </span>
                  )}

                  {isEditing ? (
                    <div className="flex items-center gap-2">
                      <ParchmentInput
                        value={draftTitle}
                        onChange={e => setDraftTitle(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') saveRename(p.id);
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        aria-label="Project title"
                        autoFocus
                      />
                      <button
                        onClick={() => saveRename(p.id)}
                        className="p-1.5 rounded text-forest-700 hover:bg-forest-500/10"
                        aria-label="Save title"
                      >
                        <Check size={16} />
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="p-1.5 rounded text-sepia-600 hover:bg-sepia-300/30"
                        aria-label="Cancel rename"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => openProject(p.id)}
                      className="text-left group"
                      aria-label={`Open ${p.title}`}
                    >
                      <h2 className="font-serif text-lg font-semibold text-sepia-900 leading-tight break-words group-hover:text-brass-700 transition-colors">
                        {p.title || 'Untitled Project'}
                      </h2>
                    </button>
                  )}

                  <div className="flex items-center gap-3 text-xs text-sepia-700 font-mono mt-auto">
                    <span className="inline-flex items-center gap-1">
                      <BookOpen size={13} aria-hidden="true" />
                      {p.chapterCount}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <FileText size={13} aria-hidden="true" />
                      {p.wordCount.toLocaleString()}w
                    </span>
                    <span className="inline-flex items-center gap-1.5 ml-auto">
                      <span className={`w-2 h-2 rounded-full ${statusDot[p.status] ?? 'bg-sepia-500'}`} aria-hidden="true" />
                      {p.status}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-sepia-300/30">
                    <span className="text-[10px] text-sepia-600 font-mono">Updated {relativeTime(p.updatedAt)}</span>
                    <div className="flex items-center gap-0.5">
                      <button
                        onClick={() => startRename(p)}
                        className="p-1.5 rounded text-sepia-600 hover:text-brass-700 hover:bg-brass-500/10"
                        aria-label={`Rename ${p.title}`}
                        title="Rename"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => handleDelete(p)}
                        className="p-1.5 rounded text-sepia-600 hover:text-wax-700 hover:bg-wax-500/10"
                        aria-label={`Delete ${p.title}`}
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </ParchmentCard>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
