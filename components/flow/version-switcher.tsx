'use client';

import { useState } from 'react';
import { Check, Pencil, Trash2, Crown, X } from 'lucide-react';
import { ParchmentCard } from '@/components/antiquarian';
import type { ChapterVersion } from '@/lib/types/chapter-version';

interface VersionSwitcherProps {
  versions: ChapterVersion[];
  activeVersionId: string | null;
  onSwitch: (versionId: string) => void;
  onRename: (versionId: string, newLabel: string) => void;
  onMarkCanonical: (versionId: string) => void;
  onDelete: (versionId: string) => void;
  onCreate: () => void;
  onCompare: () => void;
  onClose: () => void;
}

export function VersionSwitcher({
  versions,
  activeVersionId,
  onSwitch,
  onRename,
  onMarkCanonical,
  onDelete,
  onCreate,
  onCompare,
  onClose,
}: VersionSwitcherProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');

  const startRename = (v: ChapterVersion) => {
    setEditingId(v.id);
    setEditLabel(v.label);
  };

  const confirmRename = () => {
    if (editingId && editLabel.trim()) {
      onRename(editingId, editLabel.trim());
    }
    setEditingId(null);
  };

  return (
    <div className="absolute top-full right-0 mt-1 z-50 w-80" data-testid="version-switcher">
      <ParchmentCard className="p-3 shadow-lg">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-sepia-800">Versions</h3>
          <button onClick={onClose} className="text-sepia-600 hover:text-sepia-700" aria-label="Close version panel">
            <X size={14} />
          </button>
        </div>

        <div className="space-y-1 max-h-60 overflow-y-auto">
          {versions.map(v => (
            <div
              key={v.id}
              className={`flex items-center gap-2 px-2 py-1.5 rounded text-sm cursor-pointer transition-colors ${
                v.id === activeVersionId ? 'bg-forest-900/10 text-sepia-900' : 'hover:bg-parchment-200 text-sepia-700'
              }`}
            >
              {editingId === v.id ? (
                <div className="flex-1 flex items-center gap-1">
                  <input
                    value={editLabel}
                    onChange={e => setEditLabel(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && confirmRename()}
                    className="flex-1 bg-parchment-50 border border-sepia-300 rounded px-1 py-0.5 text-xs"
                    autoFocus
                    aria-label="Version label"
                  />
                  <button onClick={confirmRename} className="text-forest-700" aria-label="Confirm rename">
                    <Check size={12} />
                  </button>
                </div>
              ) : (
                <>
                  <button onClick={() => onSwitch(v.id)} className="flex-1 text-left truncate" title={v.label}>
                    {v.label}
                    {v.isCanonical && <Crown size={10} className="inline ml-1 text-brass-500" />}
                  </button>
                  <span className="text-[10px] text-sepia-600 shrink-0">{v.wordCount}w</span>
                  <button onClick={() => startRename(v)} className="text-sepia-600 hover:text-sepia-700 shrink-0" aria-label="Rename version">
                    <Pencil size={10} />
                  </button>
                  {!v.isCanonical && (
                    <button onClick={() => onMarkCanonical(v.id)} className="text-sepia-600 hover:text-brass-600 shrink-0" aria-label="Mark as canonical" title="Mark as canonical">
                      <Crown size={10} />
                    </button>
                  )}
                  {versions.length > 1 && (
                    <button onClick={() => onDelete(v.id)} className="text-sepia-600 hover:text-wax-500 shrink-0" aria-label="Delete version">
                      <Trash2 size={10} />
                    </button>
                  )}
                </>
              )}
            </div>
          ))}
        </div>

        <div className="flex gap-2 mt-2 pt-2 border-t border-sepia-300/30">
          <button
            onClick={onCreate}
            className="flex-1 text-xs text-center py-1 rounded bg-parchment-200 hover:bg-parchment-300 text-sepia-700 transition-colors"
          >
            New Version
          </button>
          {versions.length >= 2 && (
            <button
              onClick={onCompare}
              className="flex-1 text-xs text-center py-1 rounded bg-parchment-200 hover:bg-parchment-300 text-sepia-700 transition-colors"
            >
              Compare
            </button>
          )}
        </div>
      </ParchmentCard>
    </div>
  );
}
