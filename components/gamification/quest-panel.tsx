'use client';

import { Scroll } from 'lucide-react';
import { DecorativeDivider } from '@/components/antiquarian';
import { QuestCard } from './quest-card';
import type { DailyQuest } from '@/lib/types/gamification';

interface QuestPanelProps {
  quests: DailyQuest[];
  onComplete: (id: string) => void;
}

export function QuestPanel({ quests, onComplete }: QuestPanelProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Scroll size={16} className="text-brass-600" aria-hidden="true" />
        <h2 className="text-sm font-serif font-semibold text-sepia-700 uppercase tracking-wider">Daily Quests</h2>
        <DecorativeDivider variant="section" className="flex-1" />
      </div>
      {/* M11: Empty state */}
      {quests.length === 0 ? (
        <p className="text-xs text-sepia-600 italic py-4 text-center">No quests available today. Check back tomorrow!</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {quests.map((quest) => (
            <QuestCard key={quest.id} quest={quest} onComplete={onComplete} />
          ))}
        </div>
      )}
    </div>
  );
}
