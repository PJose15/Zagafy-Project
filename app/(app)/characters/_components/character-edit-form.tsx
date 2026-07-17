'use client';

import { useTranslations } from 'next-intl';
import { AnimatePresence, motion } from 'motion/react';
import { Activity, Heart, History, Save, X } from 'lucide-react';
import { springs } from '@/lib/animations';
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

  const tabs: { key: EditTab; labelKey: string; icon?: React.ReactNode }[] = [
    { key: 'profile', labelKey: 'tabProfile' },
    { key: 'state', labelKey: 'tabState', icon: <Activity size={16} aria-hidden="true" /> },
    { key: 'relationships', labelKey: 'tabRelationships', icon: <Heart size={16} aria-hidden="true" /> },
    { key: 'history', labelKey: 'tabHistory', icon: <History size={16} aria-hidden="true" /> },
  ];

  // Roving tabindex: Left/Right walk the tablist, wrapping at the edges.
  const handleTablistKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const idx = tabs.findIndex(tb => tb.key === activeTab);
    const next = e.key === 'ArrowRight' ? (idx + 1) % tabs.length : (idx - 1 + tabs.length) % tabs.length;
    setActiveTab(tabs[next].key);
    (e.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]')[next])?.focus();
  };

  return (
    <div className="p-6 space-y-6">
      <div role="tablist" onKeyDown={handleTablistKey} className="flex items-center gap-1 md:gap-2 border-b border-sepia-300/50 overflow-x-auto">
        {tabs.map(tb => {
          const selected = activeTab === tb.key;
          return (
            <button
              key={tb.key}
              role="tab"
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActiveTab(tb.key)}
              className={`relative px-4 py-2.5 text-sm font-medium transition-colors flex items-center gap-2 whitespace-nowrap ${
                selected ? 'text-sepia-900' : 'text-sepia-600 hover:text-sepia-800'
              }`}
            >
              {tb.icon} {t(tb.labelKey)}
              {selected && (
                <motion.span
                  layoutId="char-edit-tab-underline"
                  transition={springs.stamp}
                  className="absolute left-2 right-2 bottom-0 h-[2px] rounded-full bg-brass-600"
                  aria-hidden="true"
                />
              )}
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
        >
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
        </motion.div>
      </AnimatePresence>

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
