'use client';

import { useTranslations } from 'next-intl';
import { ParchmentCard } from '@/components/antiquarian';
import { X, Zap, Eye, Heart, Clock, Sparkles, MessageSquare } from 'lucide-react';
import type { CoachingInsight, CoachingLens } from '@/lib/story-coach/types';

const LENS_ICONS: Record<CoachingLens, React.FC<{ size?: number; className?: string }>> = {
  tension: Zap,
  sensory: Eye,
  motivation: Heart,
  pacing: Clock,
  foreshadowing: Sparkles,
  dialogue: MessageSquare,
};

const LENS_COLORS: Record<CoachingLens, string> = {
  tension: 'text-wax-600',
  sensory: 'text-forest-600',
  motivation: 'text-brass-600',
  pacing: 'text-sepia-600',
  foreshadowing: 'text-purple-600',
  dialogue: 'text-blue-600',
};

const PRIORITY_STYLES: Record<string, string> = {
  high: 'bg-wax-500/10 text-wax-600 border-wax-500/20',
  medium: 'bg-brass-500/10 text-brass-600 border-brass-500/20',
  low: 'bg-sepia-300/10 text-sepia-600 border-sepia-300/20',
};

interface CoachingInsightCardProps {
  insight: CoachingInsight;
  onDismiss: () => void;
}

export function CoachingInsightCard({ insight, onDismiss }: CoachingInsightCardProps) {
  const t = useTranslations('storyCoach');
  const Icon = LENS_ICONS[insight.lens];
  const iconColor = LENS_COLORS[insight.lens];

  return (
    <ParchmentCard padding="sm" className="relative group">
      <button
        onClick={onDismiss}
        className="absolute top-2 right-2 p-0.5 text-sepia-600 hover:text-sepia-600 rounded opacity-0 group-hover:opacity-100 transition-opacity"
        aria-label={t('dismissAria')}
      >
        <X size={12} />
      </button>

      <div className="flex items-start gap-2.5">
        <Icon size={16} className={`shrink-0 mt-0.5 ${iconColor}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-medium uppercase tracking-wider text-sepia-600">
              {t(`lens.${insight.lens}`)}
            </span>
            <span className={`text-[9px] px-1.5 py-0.5 rounded border ${PRIORITY_STYLES[insight.priority]}`}>
              {t(`priority.${insight.priority}`)}
            </span>
          </div>
          <p className="text-xs text-sepia-700 leading-relaxed mb-2">{insight.observation}</p>
          <div className="bg-forest-700/5 border border-forest-700/10 rounded-lg px-2.5 py-2">
            <p className="text-xs text-forest-800 leading-relaxed">{insight.suggestion}</p>
          </div>
        </div>
      </div>
    </ParchmentCard>
  );
}
