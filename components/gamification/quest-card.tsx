'use client';

import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { MessageSquareText, Users, BookOpen, Check } from 'lucide-react';
import { BrassButton } from '@/components/antiquarian';
import { ParchmentCard } from '@/components/antiquarian';
import type { DailyQuest, QuestType } from '@/lib/types/gamification';

const questIcons: Record<QuestType, typeof MessageSquareText> = {
  dialogue: MessageSquareText,
  character: Users,
  story: BookOpen,
};

interface QuestCardProps {
  quest: DailyQuest;
  onComplete: (id: string) => void;
}

export function QuestCard({ quest, onComplete }: QuestCardProps) {
  const t = useTranslations('gamification');
  const Icon = questIcons[quest.type] ?? BookOpen; // M9-adjacent: fallback for unknown type
  const isCompleted = quest.status === 'completed';
  const [completing, setCompleting] = useState(false);
  const [showDone, setShowDone] = useState(false);

  // M13: Prevent double-click; M7: Brief visual confirmation
  const handleComplete = useCallback(() => {
    if (completing) return;
    setCompleting(true);
    onComplete(quest.id);
    setShowDone(true);
    setTimeout(() => setShowDone(false), 1000);
  }, [completing, onComplete, quest.id]);

  return (
    <ParchmentCard
      padding="sm"
      className={isCompleted ? 'opacity-60' : ''}
    >
      <div className="flex items-start gap-3">
        <div className="shrink-0 w-8 h-8 rounded-lg bg-brass-500/10 flex items-center justify-center">
          {isCompleted ? (
            // M4: Accessible completed icon
            <Check size={16} className="text-forest-600" aria-label={t('completedAria')} />
          ) : (
            <Icon size={16} className="text-brass-600" aria-hidden="true" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-sepia-600 uppercase">{t(`questType.${quest.type}`)}</span>
            <span className="text-[10px] font-mono text-brass-500">{t('xpReward', { xp: quest.xpReward })}</span>
          </div>
          <h4 className="text-sm font-medium text-sepia-800 mt-0.5">{quest.title}</h4>
          <p className="text-xs text-sepia-600 mt-1 leading-relaxed">{quest.description}</p>
          {!isCompleted && (
            <BrassButton
              size="sm"
              className="mt-2"
              onClick={handleComplete}
              disabled={completing}
            >
              {showDone ? t('questDone') : completing ? t('completing') : t('complete')}
            </BrassButton>
          )}
        </div>
      </div>
    </ParchmentCard>
  );
}
