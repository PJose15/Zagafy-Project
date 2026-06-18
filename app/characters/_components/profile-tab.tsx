'use client';

import type { Character, CanonStatus } from '@/lib/store';

interface ProfileTabProps {
  editForm: Partial<Character>;
  setEditForm: (form: Partial<Character>) => void;
}

export function ProfileTab({ editForm, setEditForm }: ProfileTabProps) {
  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
      <div className="grid grid-cols-2 gap-4">
        <input
          type="text"
          value={editForm.name || ''}
          onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
          className="w-full bg-parchment-200 border border-sepia-300/50 rounded-lg px-4 py-3 text-xl font-serif font-semibold text-sepia-900 focus:outline-none focus:ring-2 focus:ring-brass-400/40"
          placeholder="Character Name"
        />
        <input
          type="text"
          value={editForm.role || ''}
          onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
          className="w-full bg-parchment-200 border border-sepia-300/50 rounded-lg px-4 py-3 text-sm font-sans text-sepia-700 focus:outline-none focus:ring-2 focus:ring-brass-400/40"
          placeholder="Role (e.g., Protagonist, Antagonist)"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-sepia-600 uppercase tracking-wider mb-2">Core Identity (Permanent Traits)</label>
        <textarea
          value={editForm.coreIdentity || ''}
          onChange={(e) => setEditForm({ ...editForm, coreIdentity: e.target.value })}
          className="w-full h-24 bg-parchment-200 border border-sepia-300/50 rounded-lg px-4 py-3 text-sm text-sepia-700 font-sans resize-y focus:outline-none focus:ring-2 focus:ring-brass-400/40"
          placeholder="Baseline personality, permanent traits, deeply held values..."
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-sepia-600 uppercase tracking-wider mb-2">Physical Description & Background</label>
        <textarea
          value={editForm.description || ''}
          onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
          className="w-full h-32 bg-parchment-200 border border-sepia-300/50 rounded-lg px-4 py-3 text-sm text-sepia-700 font-sans resize-y focus:outline-none focus:ring-2 focus:ring-brass-400/40"
          placeholder="Physical appearance, backstory, general biography..."
        />
      </div>
      <div className="flex items-center gap-3 pt-2">
        <select
          value={editForm.canonStatus || 'draft'}
          onChange={(e) => setEditForm({ ...editForm, canonStatus: e.target.value as CanonStatus })}
          className="bg-parchment-200 border border-sepia-300/50 rounded-lg px-3 py-2 text-sm text-sepia-700 focus:outline-none focus:ring-2 focus:ring-brass-400/40"
        >
          <option value="confirmed">Confirmed Canon</option>
          <option value="flexible">Flexible Canon</option>
          <option value="draft">Draft Idea</option>
          <option value="discarded">Discarded</option>
        </select>
      </div>
    </div>
  );
}
