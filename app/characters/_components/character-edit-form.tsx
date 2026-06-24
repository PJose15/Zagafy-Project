'use client';

import { useTranslations } from 'next-intl';
import { Activity, Heart, History, Save, X } from 'lucide-react';
import type { Character } from '@/lib/store';
import { ProfileTab } from './profile-tab';
import { StateTab } from './state-tab';
import { RelationshipsTab } from './relationships-tab';
import { HistoryTab } from './history-tab';

export type EditTab = 'profile' | 'state' | 'relationships' | 'history';

interface CharacterEditFormProps {
  editForm: Partial<Character>;
  setEditForm: (form: Partial<Character>) => void;
  activeTab: EditTab;
  setActiveTab: (tab: EditTab) => void;
  characters: Character[];
  currentCharId: string;
  onSave: () => void;
  onCancel: () => void;
}

export function CharacterEditForm({
  editForm,
  setEditForm,
  activeTab,
  setActiveTab,
  characters,
  currentCharId,
  onSave,
  onCancel,
}: CharacterEditFormProps) {
  const t = useTranslations('characters');
  const tCommon = useTranslations('common');
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-2 md:gap-4 border-b border-sepia-300/50 pb-4 overflow-x-auto">
        <button
          onClick={() => setActiveTab('profile')}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${activeTab === 'profile' ? 'bg-parchment-200 text-sepia-900' : 'text-sepia-600 hover:text-sepia-800'}`}
        >
          {t('tabProfile')}
        </button>
        <button
          onClick={() => setActiveTab('state')}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 ${activeTab === 'state' ? 'bg-forest-500/20 text-brass-400' : 'text-sepia-600 hover:text-sepia-800'}`}
        >
          <Activity size={16} aria-hidden="true" /> {t('tabState')}
        </button>
        <button
          onClick={() => setActiveTab('relationships')}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 ${activeTab === 'relationships' ? 'bg-wax-500/15 text-wax-500' : 'text-sepia-600 hover:text-sepia-800'}`}
        >
          <Heart size={16} aria-hidden="true" /> {t('tabRelationships')}
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 ${activeTab === 'history' ? 'bg-brass-500/20 text-brass-400' : 'text-sepia-600 hover:text-sepia-800'}`}
        >
          <History size={16} aria-hidden="true" /> {t('tabHistory')}
        </button>
      </div>

      {activeTab === 'profile' && <ProfileTab editForm={editForm} setEditForm={setEditForm} />}
      {activeTab === 'state' && <StateTab editForm={editForm} setEditForm={setEditForm} />}
      {activeTab === 'relationships' && (
        <RelationshipsTab
          editForm={editForm}
          setEditForm={setEditForm}
          characters={characters}
          currentCharId={currentCharId}
        />
      )}
      {activeTab === 'history' && <HistoryTab editForm={editForm} setEditForm={setEditForm} />}

      <div className="flex items-center justify-end gap-3 pt-6 border-t border-sepia-300/50">
        <button
          onClick={onCancel}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sepia-600 hover:text-sepia-800 hover:bg-parchment-200 transition-colors"
        >
          <X size={18} aria-hidden="true" />
          {tCommon('cancel')}
        </button>
        <button
          onClick={onSave}
          className="flex items-center gap-2 bg-forest-700 text-cream-50 px-4 py-2 rounded-lg font-medium hover:bg-forest-600 transition-colors"
        >
          <Save size={18} aria-hidden="true" />
          {t('saveCharacter')}
        </button>
      </div>
    </div>
  );
}
