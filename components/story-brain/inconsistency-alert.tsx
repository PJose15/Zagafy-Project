'use client';

import { ParchmentCard } from '@/components/antiquarian';
import { AlertTriangle, Eye, CheckCircle, Paintbrush } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Inconsistency, InconsistencyResolution, ResolutionAction } from '@/lib/story-brain/types';

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'bg-red-500/10 text-red-600 border-red-500/20',
  high: 'bg-wax-500/10 text-wax-600 border-wax-500/20',
  medium: 'bg-brass-500/10 text-brass-600 border-brass-500/20',
  low: 'bg-sepia-300/10 text-sepia-600 border-sepia-300/20',
};

interface InconsistencyAlertProps {
  inconsistency: Inconsistency;
  resolution?: InconsistencyResolution;
  onResolve: (id: string, action: ResolutionAction) => void;
  onUnresolve: (id: string) => void;
}

export function InconsistencyAlert({ inconsistency, resolution, onResolve, onUnresolve }: InconsistencyAlertProps) {
  const t = useTranslations('storyBrain');
  const isResolved = !!resolution;

  return (
    <ParchmentCard padding="sm" className={`${isResolved ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-3">
        <AlertTriangle size={16} className="shrink-0 mt-0.5 text-wax-500" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="text-sm font-medium text-sepia-800 truncate">{inconsistency.title}</h4>
            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${SEVERITY_STYLES[inconsistency.severity]}`}>
              {t(`severity.${inconsistency.severity}`)}
            </span>
          </div>
          <p className="text-xs text-sepia-600 leading-relaxed">{inconsistency.description}</p>

          {isResolved ? (
            <div className="flex items-center gap-2 mt-2">
              <span className="text-[10px] text-forest-600 flex items-center gap-1">
                <CheckCircle size={10} /> {t('alert.resolved', { action: t(`resolutionAction.${resolution.action}`) })}
              </span>
              <button
                onClick={() => onUnresolve(inconsistency.id)}
                className="text-[10px] text-sepia-600 hover:text-sepia-700 underline"
              >
                {t('alert.undo')}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 mt-2">
              <button
                onClick={() => onResolve(inconsistency.id, 'ignore')}
                className="text-[10px] px-2 py-1 rounded bg-sepia-200/50 text-sepia-600 hover:bg-sepia-200 transition-colors flex items-center gap-1"
              >
                <Eye size={10} /> {t('alert.ignore')}
              </button>
              <button
                onClick={() => onResolve(inconsistency.id, 'correct')}
                className="text-[10px] px-2 py-1 rounded bg-forest-700/10 text-forest-700 hover:bg-forest-700/20 transition-colors flex items-center gap-1"
              >
                <Paintbrush size={10} /> {t('alert.correct')}
              </button>
              <button
                onClick={() => onResolve(inconsistency.id, 'intentional')}
                className="text-[10px] px-2 py-1 rounded bg-brass-500/10 text-brass-600 hover:bg-brass-500/20 transition-colors flex items-center gap-1"
              >
                <CheckCircle size={10} /> {t('alert.intentional')}
              </button>
            </div>
          )}
        </div>
      </div>
    </ParchmentCard>
  );
}
