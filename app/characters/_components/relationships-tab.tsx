'use client';

import { useTranslations } from 'next-intl';
import { Trash2 } from 'lucide-react';
import type { Character, CharacterRelationship } from '@/lib/store';

interface RelationshipsTabProps {
  editForm: Partial<Character>;
  setEditForm: (form: Partial<Character>) => void;
  characters: Character[];
  currentCharId: string;
}

export function RelationshipsTab({ editForm, setEditForm, characters, currentCharId }: RelationshipsTabProps) {
  const t = useTranslations('characters');
  const rels = editForm.dynamicRelationships || [];

  const updateRels = (newRels: CharacterRelationship[]) => {
    setEditForm({ ...editForm, dynamicRelationships: newRels });
  };

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
      <label className="block text-xs font-medium text-sepia-600 uppercase tracking-wider mb-2">{t('generalNotesLabel')}</label>
      <textarea
        value={editForm.relationships || ''}
        onChange={(e) => setEditForm({ ...editForm, relationships: e.target.value })}
        className="w-full h-24 bg-parchment-200 border border-sepia-300/50 rounded-lg px-4 py-3 text-sm text-sepia-600 font-sans resize-y focus:outline-none focus:ring-2 focus:ring-brass-400/40"
        placeholder={t('generalNotesPlaceholder')}
      />

      <div className="mt-6">
        <div className="flex items-center justify-between mb-4">
          <label className="block text-xs font-medium text-sepia-600 uppercase tracking-wider">{t('dynamicMapLabel')}</label>
          <button
            onClick={() => {
              const newRel: CharacterRelationship = { targetId: '', trustLevel: 50, tensionLevel: 50, dynamics: '' };
              updateRels([...rels, newRel]);
            }}
            className="text-xs bg-parchment-200 hover:bg-parchment-300 text-sepia-700 px-3 py-1.5 rounded-lg transition-colors"
          >
            {t('addLink')}
          </button>
        </div>

        <div className="space-y-3">
          {rels.map((rel, idx) => (
            <div key={idx} className="bg-parchment-200 border border-sepia-300/50 rounded-xl p-4 flex gap-4 items-start">
              <div className="w-1/3">
                <select
                  value={rel.targetId}
                  onChange={(e) => {
                    updateRels(rels.map((r, i) => (i === idx ? { ...r, targetId: e.target.value } : r)));
                  }}
                  className="w-full bg-parchment-100 border border-sepia-300/50 rounded-lg px-3 py-2 text-sm text-sepia-700 focus:outline-none focus:ring-2 focus:ring-brass-400/40"
                >
                  <option value="">{t('selectCharacter')}</option>
                  {characters.filter((c) => c.id !== currentCharId).map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="w-2/3 space-y-3">
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <div className="flex justify-between text-xs text-sepia-600 mb-1">
                      <span>{t('trust', { value: rel.trustLevel })}</span>
                    </div>
                    <input
                      type="range"
                      min="0" max="100"
                      value={rel.trustLevel}
                      onChange={(e) => {
                        updateRels(rels.map((r, i) => (i === idx ? { ...r, trustLevel: parseInt(e.target.value) } : r)));
                      }}
                      className="w-full accent-forest-500"
                    />
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between text-xs text-sepia-600 mb-1">
                      <span>{t('tension', { value: rel.tensionLevel })}</span>
                    </div>
                    <input
                      type="range"
                      min="0" max="100"
                      value={rel.tensionLevel}
                      onChange={(e) => {
                        updateRels(rels.map((r, i) => (i === idx ? { ...r, tensionLevel: parseInt(e.target.value) } : r)));
                      }}
                      className="w-full accent-red-500"
                    />
                  </div>
                </div>
                <input
                  type="text"
                  value={rel.dynamics}
                  onChange={(e) => {
                    updateRels(rels.map((r, i) => (i === idx ? { ...r, dynamics: e.target.value } : r)));
                  }}
                  className="w-full bg-parchment-100 border border-sepia-300/50 rounded-lg px-3 py-2 text-sm text-sepia-700 focus:outline-none focus:ring-2 focus:ring-brass-400/40"
                  placeholder={t('dynamicsPlaceholder')}
                />
              </div>
              <button
                onClick={() => {
                  const newRels = [...rels];
                  newRels.splice(idx, 1);
                  updateRels(newRels);
                }}
                className="p-2 text-sepia-600 hover:text-wax-500 hover:bg-parchment-200 rounded-lg transition-colors"
                aria-label={t('removeRelationship')}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          {rels.length === 0 && (
            <div className="text-center py-6 text-sm text-sepia-600 border border-dashed border-sepia-300/50 rounded-xl">
              {t('noRelationships')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
