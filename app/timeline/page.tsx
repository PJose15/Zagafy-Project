'use client';

import { useStory, TimelineEvent, CanonStatus } from '@/lib/store';
import { useState } from 'react';
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes';
import { Plus, Trash2, Edit3, Save, X, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useConfirm } from '@/components/confirm-dialog';
import { BrassButton, CarvedHeader, EmptyState, ParchmentCard, DecorativeDivider, ParchmentInput, ParchmentTextarea, ParchmentSelect, InkStampButton, WaxSealBadge } from '@/components/antiquarian';

const markerColorByCanon: Record<string, string> = {
  confirmed: 'bg-forest-700',
  flexible: 'bg-brass-600',
  draft: 'bg-sepia-500 border border-dashed border-sepia-400',
  discarded: 'bg-wax-600 opacity-50',
};

export default function TimelinePage() {
  const { state, updateField } = useStory();
  const { confirm } = useConfirm();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<TimelineEvent>>({});
  const [isNewItem, setIsNewItem] = useState(false);
  useUnsavedChanges(editingId !== null);

  const handleAddEvent = () => {
    const newEvent: TimelineEvent = {
      id: crypto.randomUUID(),
      date: 'Year 1, Day 1',
      description: 'A new event begins...',
      impact: '',
      canonStatus: 'draft',
    };
    updateField('timeline_events', [...state.timeline_events, newEvent]);
    setEditingId(newEvent.id);
    setEditForm(newEvent);
    setIsNewItem(true);
  };

  const handleSave = () => {
    if (!editingId) return;
    if (!editForm.description?.trim()) return;
    const updated = state.timeline_events.map((e) =>
      e.id === editingId ? { ...e, ...editForm } : e
    );
    updateField('timeline_events', updated as TimelineEvent[]);
    setEditingId(null);
    setIsNewItem(false);
  };

  const handleCancel = () => {
    if (isNewItem && editingId) {
      updateField('timeline_events', state.timeline_events.filter(e => e.id !== editingId));
    }
    setEditingId(null);
    setIsNewItem(false);
  };

  const handleDelete = async (id: string) => {
    const event = state.timeline_events.find(e => e.id === id);
    const confirmed = await confirm({
      title: 'Delete timeline event?',
      message: `Are you sure you want to delete "${event?.date || 'this event'}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!confirmed) return;
    updateField('timeline_events', state.timeline_events.filter((e) => e.id !== id));
  };

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-8">
      <CarvedHeader
        title="Timeline"
        subtitle="Track key events and their impact on the story."
        icon={<Clock size={24} />}
        actions={
          <BrassButton onClick={handleAddEvent} icon={<Plus size={18} />}>
            Add Event
          </BrassButton>
        }
      />

      <DecorativeDivider variant="chapter-break" className="my-4" />

      <div className="relative space-y-8 before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-sepia-300/50 before:to-transparent">
        <AnimatePresence>
          {state.timeline_events.map((event, index) => (
            <motion.div
              key={event.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active"
            >
              <div className={`flex items-center justify-center w-10 h-10 rounded-full border-4 border-parchment-50 ${markerColorByCanon[event.canonStatus || ''] || 'bg-brass-600'} text-sepia-600 group-hover:text-brass-500 group-hover:bg-brass-700 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10 transition-colors`}>
                <Clock size={16} />
              </div>

              <ParchmentCard className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)]">
                {editingId === event.id ? (
                  <div className="space-y-4">
                    <ParchmentInput
                      type="text"
                      value={editForm.date || ''}
                      onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                      className="font-mono text-brass-500"
                      placeholder="Date / Time (e.g., Year 1, Day 1)"
                    />
                    <ParchmentTextarea
                      value={editForm.description || ''}
                      onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                      className="h-24"
                      placeholder="Event description..."
                    />
                    <ParchmentTextarea
                      value={editForm.impact || ''}
                      onChange={(e) => setEditForm({ ...editForm, impact: e.target.value })}
                      className="h-20"
                      placeholder="Impact on the story/characters..."
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
                      <div className="flex-1" />
                      <InkStampButton variant="ghost" size="sm" onClick={handleCancel} icon={<X size={16} />}>
                        Cancel
                      </InkStampButton>
                      <InkStampButton variant="primary" size="sm" onClick={handleSave} icon={<Save size={16} />}>
                        Save
                      </InkStampButton>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm text-brass-500 bg-brass-400/10 px-2 py-1 rounded">{event.date}</span>
                        {event.canonStatus && (
                          <WaxSealBadge status={event.canonStatus} />
                        )}
                      </div>
                      <div className="flex items-center gap-1 md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100 transition-opacity">
                        <button
                          onClick={() => {
                            setEditingId(event.id);
                            setEditForm(event);
                          }}
                          className="p-1.5 text-sepia-600 hover:text-brass-500 hover:bg-sepia-300/20 rounded-md transition-colors"
                          aria-label={`Edit event: ${event.date}`}
                        >
                          <Edit3 size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(event.id)}
                          className="p-1.5 text-sepia-600 hover:text-wax-500 hover:bg-sepia-300/20 rounded-md transition-colors"
                          aria-label={`Delete event: ${event.date}`}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                    <p className="text-sepia-700 leading-relaxed text-sm mt-3">{event.description}</p>
                    {event.impact && (
                      <div className="mt-4 pt-3 border-t border-sepia-300/50">
                        <span className="text-xs font-medium text-sepia-600 uppercase tracking-wider block mb-1">Impact</span>
                        <p className="text-sm text-sepia-600">{event.impact}</p>
                      </div>
                    )}
                  </div>
                )}
              </ParchmentCard>
            </motion.div>
          ))}
        </AnimatePresence>

        {state.timeline_events.length === 0 && (
          <EmptyState variant="timeline" title="Your timeline is empty" subtitle="Mark the moments that shaped your story." action={{ label: 'Add your first event', onClick: handleAddEvent }} />
        )}
      </div>

      <DecorativeDivider variant="chapter-break" className="my-4" />
    </div>
  );
}
