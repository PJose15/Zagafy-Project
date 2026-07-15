'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Users } from 'lucide-react';
import { useStory, Character } from '@/lib/store';
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes';
import { fadeUp } from '@/lib/animations';
import { useConfirm } from '@/components/confirm-dialog';
import { CarvedHeader, BrassButton } from '@/components/antiquarian';
import { CharacterEditForm, EditTab } from './_components/character-edit-form';
import { CharacterViewCard } from './_components/character-view-card';

export default function CharactersPage() {
  const t = useTranslations('characters');
  const tCommon = useTranslations('common');
  const { state, updateField } = useStory();
  const { confirm } = useConfirm();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Character>>({});
  const [activeTab, setActiveTab] = useState<EditTab>('profile');
  const [isNewItem, setIsNewItem] = useState(false);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<Record<string, string>>({});
  useUnsavedChanges(editingId !== null);

  const handleAnalyzeState = async (char: Character) => {
    setAnalyzingId(char.id);
    try {
      const relationships = (char.dynamicRelationships || []).map((r) => {
        const target = state.characters.find((c) => c.id === r.targetId);
        return {
          targetName: target?.name || 'Unknown', // internal payload to AI; not shown in UI
          trustLevel: r.trustLevel,
          tensionLevel: r.tensionLevel,
          dynamics: r.dynamics,
        };
      });

      const res = await fetch('/api/analyze-character', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          character: {
            name: char.name,
            role: char.role,
            coreIdentity: char.coreIdentity,
            currentState: char.currentState,
            stateHistory: (char.stateHistory || []).map((h) => ({
              context: h.context,
              changes: h.changes,
            })),
            relationships,
          },
          language: state.language || 'English',
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Analysis failed');
      }

      const data = await res.json();
      setAnalysisResult((prev) => ({ ...prev, [char.id]: data.analysis }));
    } catch (error) {
      console.error(error);
      setAnalysisResult((prev) => ({ ...prev, [char.id]: t('analysisFailedResult') }));
    } finally {
      setAnalyzingId(null);
    }
  };

  const handleAddCharacter = () => {
    const newCharacter: Character = {
      id: crypto.randomUUID(),
      name: t('newCharacterName'),
      role: t('newCharacterRole'),
      description: '',
      coreIdentity: '',
      relationships: '',
      canonStatus: 'draft',
      currentState: {
        emotionalState: '',
        visibleGoal: '',
        hiddenNeed: '',
        currentFear: '',
        dominantBelief: '',
        emotionalWound: '',
        pressureLevel: 'Low',
        currentKnowledge: '',
        indicator: 'stable',
      },
      dynamicRelationships: [],
      stateHistory: [],
    };
    updateField('characters', [...state.characters, newCharacter]);
    setEditingId(newCharacter.id);
    setExpandedId(newCharacter.id);
    setEditForm(newCharacter);
    setActiveTab('profile');
    setIsNewItem(true);
  };

  const handleSave = () => {
    if (!editingId) return;
    if (!editForm.name?.trim()) return;
    const cleanedForm = {
      ...editForm,
      dynamicRelationships: (editForm.dynamicRelationships || []).filter((r) => r.targetId),
    };
    const updated = state.characters.map((c) =>
      c.id === editingId ? { ...c, ...cleanedForm } : c
    );
    updateField('characters', updated as Character[]);
    setEditingId(null);
    setIsNewItem(false);
  };

  const handleCancel = () => {
    if (isNewItem && editingId) {
      updateField('characters', state.characters.filter((c) => c.id !== editingId));
    }
    setEditingId(null);
    setIsNewItem(false);
  };

  const handleDelete = async (id: string) => {
    const char = state.characters.find((c) => c.id === id);
    const confirmed = await confirm({
      title: t('deleteTitle'),
      message: t('deleteMessage', { name: char?.name || t('deleteFallback') }),
      confirmLabel: tCommon('delete'),
      variant: 'danger',
    });
    if (!confirmed) return;
    updateField('characters', state.characters.filter((c) => c.id !== id));
  };

  const handleEditClick = (char: Character) => {
    setEditingId(char.id);
    setExpandedId(char.id);
    setEditForm(char);
    setActiveTab('profile');
  };

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-8">
      <motion.div {...fadeUp}>
        <CarvedHeader
          title={t('title')}
          subtitle={t('subtitle')}
          actions={
            <BrassButton onClick={handleAddCharacter}>
              <Plus size={18} />
              {t('addCharacter')}
            </BrassButton>
          }
        />
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        <AnimatePresence>
          {state.characters.map((char) => {
            const isExpanded = expandedId === char.id;
            const isEditing = editingId === char.id;

            return (
              <motion.div
                key={char.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="bg-parchment-100 border border-sepia-300/50 rounded-xl overflow-hidden texture-parchment shadow-parchment transition-colors duration-300"
              >
                <AnimatePresence mode="wait" initial={false}>
                {isEditing ? (
                  <motion.div
                    key="edit"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.18, ease: 'easeOut' }}
                  >
                    <CharacterEditForm
                      editForm={editForm}
                      setEditForm={setEditForm}
                      activeTab={activeTab}
                      setActiveTab={setActiveTab}
                      characters={state.characters}
                      currentCharId={char.id}
                      onSave={handleSave}
                      onCancel={handleCancel}
                    />
                  </motion.div>
                ) : (
                  <motion.div
                    key="view"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.18, ease: 'easeOut' }}
                  >
                    <CharacterViewCard
                      char={char}
                      characters={state.characters}
                      isExpanded={isExpanded}
                      isAnalyzing={analyzingId === char.id}
                      analysisResult={analysisResult[char.id]}
                      onToggleExpand={() => setExpandedId(isExpanded ? null : char.id)}
                      onEdit={() => handleEditClick(char)}
                      onDelete={() => handleDelete(char.id)}
                      onAnalyze={() => handleAnalyzeState(char)}
                    />
                  </motion.div>
                )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {state.characters.length === 0 && (
          <div className="col-span-full text-center py-20">
            <Users size={48} className="mx-auto text-sepia-300 mb-4" aria-hidden="true" />
            <p className="text-sepia-600 text-lg">{t('emptyTitle')}</p>
            <p className="text-sepia-600 text-sm mt-2">{t('emptySubtitle')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
