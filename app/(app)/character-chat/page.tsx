'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useStory } from '@/lib/store';
import { CarvedHeader, ParchmentCard, ParchmentSelect, FeatureErrorBoundary } from '@/components/antiquarian';
import { CharacterChatPanel } from '@/components/character-chat/character-chat-panel';
import { MessageCircle } from 'lucide-react';

function CharacterChatContent() {
  const t = useTranslations('characterChat');
  const { state } = useStory();
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);

  const selectedCharacter = state.characters.find(c => c.id === selectedCharacterId);

  return (
    <div className="space-y-6">
      <CarvedHeader title={t('title')} icon={<MessageCircle size={24} />} />

      <ParchmentCard className="p-4">
        <label
          htmlFor="character-chat-select"
          className="block text-xs text-sepia-600 font-mono uppercase tracking-widest mb-2"
        >
          {t('selectLabel')}
        </label>
        <ParchmentSelect
          id="character-chat-select"
          value={selectedCharacterId || ''}
          onChange={(e) => setSelectedCharacterId(e.target.value || null)}
        >
          <option value="">{t('choosePlaceholder')}</option>
          {state.characters.map(c => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.role})
            </option>
          ))}
        </ParchmentSelect>
      </ParchmentCard>

      {state.characters.length === 0 && (
        <ParchmentCard variant="aged" className="p-6 text-center">
          <p className="text-sepia-700 text-sm">
            {t('empty')}
          </p>
        </ParchmentCard>
      )}

      {selectedCharacter && (
        <CharacterChatPanel
          characterId={selectedCharacter.id}
          characterName={selectedCharacter.name}
        />
      )}
    </div>
  );
}

export default function CharacterChatPage() {
  const t = useTranslations('characterChat');
  return (
    <FeatureErrorBoundary title={t('title')}>
      <CharacterChatContent />
    </FeatureErrorBoundary>
  );
}
