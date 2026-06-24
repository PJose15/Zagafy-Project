'use client';

import { ParchmentCard } from '@/components/antiquarian';
import { AlertTriangle, Eye, CheckCircle, Paintbrush, ArrowRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { PlotHole } from '@/lib/story-brain/plot-hole-types';
import type { InconsistencyResolution, ResolutionAction } from '@/lib/story-brain/types';

const IMPACT_COLORS: Record<'high' | 'medium' | 'low', string> = {
  high: 'text-wax-600',
  medium: 'text-brass-600',
  low: 'text-sepia-600',
};

interface PlotHoleCardProps {
  plotHole: PlotHole;
  resolution?: InconsistencyResolution;
  onResolve: (id: string, action: ResolutionAction) => void;
  onUnresolve: (id: string) => void;
  onGoToChapter?: (chapterIndex: number) => void;
}

export function PlotHoleCard({ plotHole, resolution, onResolve, onUnresolve, onGoToChapter }: PlotHoleCardProps) {
  const t = useTranslations('storyBrain');
  const isResolved = !!resolution;
  const impactLevel = plotHole.narrativeImpact >= 70 ? 'high' : plotHole.narrativeImpact >= 40 ? 'medium' : 'low';

  return (
    <ParchmentCard padding="sm" className={isResolved ? 'opacity-60' : ''}>
      <div className="flex items-start gap-2">
        <AlertTriangle size={14} className="shrink-0 mt-0.5 text-wax-500" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium text-sepia-800 truncate">{plotHole.title}</span>
            <span className={`text-[10px] font-mono ${IMPACT_COLORS[impactLevel]}`}>
              {t('plotHole.impact', { value: plotHole.narrativeImpact })}
            </span>
          </div>
          <p className="text-xs text-sepia-600">{plotHole.description}</p>

          <div className="flex items-center gap-1.5 mt-2">
            {!isResolved && (
              <>
                <button onClick={() => onResolve(plotHole.id, 'ignore')} className="text-[10px] px-2 py-1 rounded bg-sepia-200/50 text-sepia-600 hover:bg-sepia-200 transition-colors flex items-center gap-1">
                  <Eye size={10} /> {t('plotHole.ignore')}
                </button>
                <button onClick={() => onResolve(plotHole.id, 'correct')} className="text-[10px] px-2 py-1 rounded bg-forest-700/10 text-forest-700 hover:bg-forest-700/20 transition-colors flex items-center gap-1">
                  <Paintbrush size={10} /> {t('plotHole.fix')}
                </button>
                <button onClick={() => onResolve(plotHole.id, 'intentional')} className="text-[10px] px-2 py-1 rounded bg-brass-500/10 text-brass-600 hover:bg-brass-500/20 transition-colors flex items-center gap-1">
                  <CheckCircle size={10} /> {t('plotHole.intentional')}
                </button>
              </>
            )}
            {isResolved && (
              <button onClick={() => onUnresolve(plotHole.id)} className="text-[10px] text-sepia-600 hover:text-sepia-700 underline">
                {t('plotHole.undo')}
              </button>
            )}
            {plotHole.suggestedChapterIndex !== null && onGoToChapter && (
              <button
                onClick={() => onGoToChapter(plotHole.suggestedChapterIndex!)}
                className="text-[10px] px-2 py-1 rounded bg-brass-500/10 text-brass-600 hover:bg-brass-500/20 transition-colors flex items-center gap-1 ml-auto"
              >
                {t('plotHole.goToChapter', { number: plotHole.suggestedChapterIndex + 1 })} <ArrowRight size={10} />
              </button>
            )}
          </div>
        </div>
      </div>
    </ParchmentCard>
  );
}
