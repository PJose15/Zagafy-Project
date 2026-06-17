'use client';

import { useStory, Conflict, CanonStatus } from '@/lib/store';
import { useState } from 'react';
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes';
import { Plus, Trash2, Edit3, Save, X, Swords, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { fadeUp } from '@/lib/animations';
import { useConfirm } from '@/components/confirm-dialog';
import { BrassButton, CarvedHeader, EmptyState, ParchmentCard, ParchmentInput, ParchmentTextarea, ParchmentSelect, InkStampButton, WaxSealBadge } from '@/components/antiquarian';

export default function ConflictsPage() {
  const { state, updateField } = useStory();
  const { confirm } = useConfirm();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Conflict>>({});
  const [isNewItem, setIsNewItem] = useState(false);
  useUnsavedChanges(editingId !== null);

  const handleAddConflict = () => {
    const newConflict: Conflict = {
      id: crypto.randomUUID(),
      title: 'New Conflict',
      description: '',
      status: 'active',
      canonStatus: 'draft',
    };
    updateField('active_conflicts', [...state.active_conflicts, newConflict]);
    setEditingId(newConflict.id);
    setEditForm(newConflict);
    setIsNewItem(true);
  };

  const handleSave = () => {
    if (!editingId) return;
    if (!editForm.title?.trim()) return;
    const updated = state.active_conflicts.map((c) =>
      c.id === editingId ? { ...c, ...editForm } : c
    );
    updateField('active_conflicts', updated as Conflict[]);
    setEditingId(null);
    setIsNewItem(false);
  };

  const handleCancel = () => {
    if (isNewItem && editingId) {
      updateField('active_conflicts', state.active_conflicts.filter(c => c.id !== editingId));
    }
    setEditingId(null);
    setIsNewItem(false);
  };

  const handleDelete = async (id: string) => {
    const conflict = state.active_conflicts.find(c => c.id === id);
    const confirmed = await confirm({
      title: 'Delete conflict?',
      message: `Are you sure you want to delete "${conflict?.title || 'this conflict'}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!confirmed) return;
    updateField('active_conflicts', state.active_conflicts.filter((c) => c.id !== id));
  };

  const toggleStatus = (id: string) => {
    const updated = state.active_conflicts.map((c) =>
      c.id === id ? { ...c, status: c.status === 'active' ? 'resolved' : 'active' } : c
    );
    updateField('active_conflicts', updated as Conflict[]);
  };

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-8">
      <motion.div {...fadeUp}>
        <CarvedHeader
          title="Conflicts"
          subtitle="Track active tensions, subplots, and resolutions."
          icon={<Swords size={24} />}
          actions={
            <BrassButton onClick={handleAddConflict}>
              <Plus size={18} />
              Add Conflict
            </BrassButton>
          }
        />
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <AnimatePresence>
          {state.active_conflicts.map((conflict) => (
            <motion.div
              key={conflict.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
            >
            <ParchmentCard padding="none" className={`overflow-hidden ${conflict.status === 'resolved' ? 'border-l-4 border-l-forest-600 opacity-75' : 'border-l-4 border-l-wax-500'}`}>
              {editingId === conflict.id ? (
                <div className="p-6 space-y-4">
                  <ParchmentInput
                    type="text"
                    value={editForm.title || ''}
                    onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                    className="text-xl font-serif font-semibold"
                    placeholder="Conflict Title"
                  />
                  <ParchmentTextarea
                    value={editForm.description || ''}
                    onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                    className="h-32"
                    placeholder="Describe the tension, stakes, and involved parties..."
                  />
                  <div className="flex items-center gap-3 pt-2">
                    <ParchmentSelect
                      value={editForm.canonStatus || 'draft'}
                      onChange={(e) => setEditForm({ ...editForm, canonStatus: e.target.value as CanonStatus })}
                    >
                      <option value="confirmed">Confirmed Canon</option>
                      <option value="flexible">Flexible Canon</option>
                      <option value="draft">Draft Idea</option>
                      <option value="discarded">Discarded</option>
                    </ParchmentSelect>
                    <label className="flex items-center gap-2 text-sm text-sepia-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editForm.status === 'resolved'}
                        onChange={(e) => setEditForm({ ...editForm, status: e.target.checked ? 'resolved' : 'active' })}
                        className="rounded border-sepia-300/60 bg-parchment-200 text-forest-700 focus:ring-brass-400/40"
                      />
                      Mark as Resolved
                    </label>
                    <div className="flex-1" />
                    <InkStampButton variant="ghost" onClick={handleCancel} icon={<X size={18} />}>
                      Cancel
                    </InkStampButton>
                    <InkStampButton variant="primary" onClick={handleSave} icon={<Save size={18} />}>
                      Save
                    </InkStampButton>
                  </div>
                </div>
              ) : (
                <div className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => toggleStatus(conflict.id)}
                        className={`p-1 rounded-full transition-colors ${
                          conflict.status === 'resolved' ? 'text-forest-700 bg-forest-700/10' : 'text-sepia-600 hover:text-brass-600 hover:bg-brass-500/10'
                        }`}
                        aria-label={conflict.status === 'resolved' ? `Mark "${conflict.title}" active` : `Mark "${conflict.title}" resolved`}
                      >
                        <CheckCircle2 size={20} />
                      </button>
                      <h2 className={`text-xl font-serif font-semibold ${conflict.status === 'resolved' ? 'text-sepia-600 line-through decoration-sepia-400' : 'text-sepia-900'}`}>
                        {conflict.title}
                      </h2>
                      {conflict.canonStatus && (
                        <WaxSealBadge status={conflict.canonStatus} />
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setEditingId(conflict.id);
                          setEditForm(conflict);
                        }}
                        className="p-2 text-sepia-600 hover:text-brass-500 hover:bg-sepia-300/20 rounded-lg transition-colors"
                        aria-label={`Edit ${conflict.title}`}
                      >
                        <Edit3 size={18} />
                      </button>
                      <button
                        onClick={() => handleDelete(conflict.id)}
                        className="p-2 text-sepia-600 hover:text-wax-500 hover:bg-sepia-300/20 rounded-lg transition-colors"
                        aria-label={`Delete ${conflict.title}`}
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                  <div className="pl-10">
                    <p className={`text-sm leading-relaxed whitespace-pre-wrap ${conflict.status === 'resolved' ? 'text-sepia-600' : 'text-sepia-700'}`}>
                      {conflict.description || <span className="italic text-sepia-600">No description provided.</span>}
                    </p>
                  </div>
                </div>
              )}
            </ParchmentCard>
            </motion.div>
          ))}
        </AnimatePresence>

        {state.active_conflicts.length === 0 && (
          <EmptyState variant="conflicts" title="No conflicts yet" subtitle="Every great story needs tension. What stands in your characters' way?" action={{ label: 'Add a conflict', onClick: handleAddConflict }} />
        )}
      </div>
    </div>
  );
}
