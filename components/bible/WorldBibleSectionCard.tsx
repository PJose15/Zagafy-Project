'use client';

import { useState } from 'react';
import { Pencil, Check, Trash2, ChevronUp, ChevronDown, Archive } from 'lucide-react';
import { ParchmentCard, ParchmentInput, ParchmentTextarea, WaxSealBadge, useConfirm } from '@/components/antiquarian';
import { CATEGORY_META, type WorldBibleSection } from '@/lib/types/world-bible';
import type { CanonStatus } from '@/lib/store';
import {
  promoteOne,
  demoteOne,
  isDiscarded,
  requiresConfirmConfirmation,
} from '@/lib/canon-promotion';

interface WorldBibleSectionCardProps {
  section: WorldBibleSection;
  onUpdate: (updated: WorldBibleSection) => void;
  onDelete: (id: string) => void;
}

const CANON_OPTIONS: CanonStatus[] = ['confirmed', 'flexible', 'draft', 'discarded'];

export function WorldBibleSectionCard({ section, onUpdate, onDelete }: WorldBibleSectionCardProps) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(section.title);
  const [content, setContent] = useState(section.content);
  const { confirm } = useConfirm();

  const meta = CATEGORY_META[section.category];

  const handleSave = () => {
    onUpdate({
      ...section,
      title: title.trim(),
      content: content.trim(),
      lastUpdated: new Date().toISOString(),
    });
    setEditing(false);
  };

  const handleDelete = async () => {
    const ok = await confirm({
      title: 'Delete Section',
      message: `Remove "${section.title}" from the world bible? This cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (ok) onDelete(section.id);
  };

  const setStatus = (newStatus: CanonStatus) =>
    onUpdate({ ...section, canonStatus: newStatus, lastUpdated: new Date().toISOString() });

  const handleCanonChange = async (newStatus: CanonStatus) => {
    if (requiresConfirmConfirmation(section.canonStatus, newStatus)) {
      const ok = await confirm({
        title: 'Promote to confirmed canon?',
        message:
          `"${section.title}" will be enforced as canon by the AI assistant. ` +
          'Future suggestions, audits, and chat responses will treat it as authoritative truth.',
        confirmLabel: 'Promote',
      });
      if (!ok) return;
    }
    setStatus(newStatus);
  };

  const handlePromote = () => handleCanonChange(promoteOne(section.canonStatus));
  const handleDemote = () => setStatus(demoteOne(section.canonStatus));
  const handleDiscard = async () => {
    const ok = await confirm({
      title: 'Discard section?',
      message: `Mark "${section.title}" as discarded? It will no longer be considered canon. You can restore it later.`,
      confirmLabel: 'Discard',
      variant: 'danger',
    });
    if (ok) setStatus('discarded');
  };

  return (
    <ParchmentCard padding="md" className="group">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs uppercase tracking-wider text-sepia-500 shrink-0">{meta.label}</span>
          {section.source === 'ai-extracted' && (
            <span className="text-[10px] bg-brass-500/10 text-brass-700 px-1.5 py-0.5 rounded-full shrink-0">AI</span>
          )}
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          {editing ? (
            <button
              onClick={handleSave}
              className="p-1.5 rounded-md hover:bg-forest-700/10 text-forest-700 transition-colors"
              aria-label="Save changes"
            >
              <Check size={16} />
            </button>
          ) : (
            <button
              onClick={() => setEditing(true)}
              className="p-1.5 rounded-md hover:bg-sepia-300/30 text-sepia-500 transition-colors"
              aria-label="Edit section"
            >
              <Pencil size={16} />
            </button>
          )}
          <button
            onClick={handleDelete}
            className="p-1.5 rounded-md hover:bg-wax-500/10 text-sepia-500 hover:text-wax-600 transition-colors"
            aria-label="Delete section"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {editing ? (
        <div className="mt-3 space-y-3">
          <ParchmentInput
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="font-serif font-semibold"
            placeholder="Section title..."
          />
          <ParchmentTextarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="h-40 text-sm"
            placeholder="Section content (markdown supported)..."
          />
        </div>
      ) : (
        <div className="mt-2">
          <h4 className="font-serif font-semibold text-sepia-900">{section.title}</h4>
          <div className="mt-1 text-sm text-sepia-700 leading-relaxed whitespace-pre-wrap">
            {section.content}
          </div>
        </div>
      )}

      <div className="mt-3 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <WaxSealBadge status={section.canonStatus} />
          <select
            value={section.canonStatus}
            onChange={(e) => handleCanonChange(e.target.value as CanonStatus)}
            className="text-xs bg-transparent text-sepia-500 border-none cursor-pointer focus:outline-none"
            aria-label="Canon status"
          >
            {CANON_OPTIONS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          {/* CB-05: explicit promote / demote / discard buttons */}
          {!isDiscarded(section.canonStatus) && (
            <div className="flex items-center gap-0.5 ml-1" aria-label="Canon promotion controls">
              <button
                type="button"
                onClick={handlePromote}
                disabled={section.canonStatus === 'confirmed'}
                className="p-1 rounded text-sepia-500 hover:text-forest-700 hover:bg-forest-700/10 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-sepia-500"
                aria-label="Promote canon status"
                title={section.canonStatus === 'confirmed' ? 'Already confirmed' : `Promote to ${promoteOne(section.canonStatus)}`}
              >
                <ChevronUp size={14} />
              </button>
              <button
                type="button"
                onClick={handleDemote}
                disabled={section.canonStatus === 'draft'}
                className="p-1 rounded text-sepia-500 hover:text-sepia-700 hover:bg-sepia-300/30 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-sepia-500"
                aria-label="Demote canon status"
                title={section.canonStatus === 'draft' ? 'Already draft' : `Demote to ${demoteOne(section.canonStatus)}`}
              >
                <ChevronDown size={14} />
              </button>
              <button
                type="button"
                onClick={handleDiscard}
                className="p-1 rounded text-sepia-500 hover:text-wax-600 hover:bg-wax-500/10"
                aria-label="Discard section"
                title="Mark as discarded"
              >
                <Archive size={14} />
              </button>
            </div>
          )}
        </div>
        <span className="text-[10px] text-sepia-400">
          {new Date(section.lastUpdated).toLocaleDateString()}
        </span>
      </div>
    </ParchmentCard>
  );
}
