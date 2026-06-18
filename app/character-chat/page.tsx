'use client';

import { useState } from 'react';
import { useStory } from '@/lib/store';
import { CarvedHeader, ParchmentCard, FeatureErrorBoundary } from '@/components/antiquarian';
import { CharacterChatPanel } from '@/components/character-chat/character-chat-panel';
import { MessageCircle } from 'lucide-react';

function CharacterChatContent() {
  const { state } = useStory();
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);

  const selectedCharacter = state.characters.find(c => c.id === selectedCharacterId);

  return (
    <div className="space-y-6">
      <CarvedHeader title="Character Chat" icon={<MessageCircle size={24} />} />

      <ParchmentCard className="p-4">
        <label className="block text-xs text-cream-400/60 font-mono uppercase tracking-widest mb-2">
          Select a Character
        </label>
        <select
          value={selectedCharacterId || ''}
          onChange={(e) => setSelectedCharacterId(e.target.value || null)}
          className="w-full bg-mahogany-800/50 border border-mahogany-700/30 rounded-lg px-3 py-2 text-sm text-cream-100 focus:outline-none focus:ring-1 focus:ring-brass-500/50"
        >
          <option value="">-- Choose a character --</option>
          {state.characters.map(c => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.role})
            </option>
          ))}
        </select>
      </ParchmentCard>

      {state.characters.length === 0 && (
        <ParchmentCard variant="aged" className="p-6 text-center">
          <p className="text-sepia-700 text-sm">
            No characters yet. Add characters in the Characters page first.
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
  return (
    <FeatureErrorBoundary title="Character Chat">
      <CharacterChatContent />
    </FeatureErrorBoundary>
  );
}
