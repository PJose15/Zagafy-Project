'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { PlotHole, PlotHoleType } from '@/lib/story-brain/plot-hole-types';
import type { InconsistencyResolution, ResolutionAction } from '@/lib/story-brain/types';
import { PlotHoleCard } from './plot-hole-card';

const TYPE_LABELS: Record<PlotHoleType, string> = {
  character_disappearance: 'Character Disappearances',
  conflict_unresolved: 'Unresolved Conflicts',
  late_introduction: 'Late Introductions',
  foreshadowing_unfulfilled: 'Unfulfilled Foreshadowing',
  stale_open_loop: 'Stale Open Loops',
};

interface PlotHolePanelProps {
  plotHoles: PlotHole[];
  resolutions: InconsistencyResolution[];
  onResolve: (id: string, action: ResolutionAction) => void;
  onUnresolve: (id: string) => void;
  onGoToChapter?: (chapterIndex: number) => void;
}

export function PlotHolePanel({ plotHoles, resolutions, onResolve, onUnresolve, onGoToChapter }: PlotHolePanelProps) {
  const [expandedTypes, setExpandedTypes] = useState<Set<PlotHoleType>>(new Set());
  const resolvedIds = new Set(resolutions.map(r => r.inconsistencyId));

  const grouped = new Map<PlotHoleType, PlotHole[]>();
  for (const ph of plotHoles) {
    const existing = grouped.get(ph.plotHoleType) || [];
    existing.push(ph);
    grouped.set(ph.plotHoleType, existing);
  }

  const toggleType = (type: PlotHoleType) => {
    setExpandedTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  if (plotHoles.length === 0) {
    return <p className="text-sm text-sepia-600 text-center py-8">No plot holes detected. Your narrative is solid!</p>;
  }

  const types: PlotHoleType[] = ['conflict_unresolved', 'foreshadowing_unfulfilled', 'character_disappearance', 'late_introduction', 'stale_open_loop'];

  return (
    <div className="space-y-3">
      {types.map(type => {
        const items = grouped.get(type);
        if (!items || items.length === 0) return null;

        const isExpanded = expandedTypes.has(type);
        const unresolvedCount = items.filter(i => !resolvedIds.has(i.id)).length;

        return (
          <div key={type}>
            <button
              onClick={() => toggleType(type)}
              className="flex items-center gap-2 w-full text-left py-2 px-1 hover:bg-parchment-200/50 rounded-lg transition-colors"
            >
              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <span className="text-sm font-medium text-sepia-800">{TYPE_LABELS[type]}</span>
              <span className="text-[10px] font-mono text-sepia-600">{unresolvedCount}/{items.length}</span>
            </button>
            {isExpanded && (
              <div className="space-y-2 pl-6 mt-1">
                {items.map(ph => (
                  <PlotHoleCard
                    key={ph.id}
                    plotHole={ph}
                    resolution={resolutions.find(r => r.inconsistencyId === ph.id)}
                    onResolve={onResolve}
                    onUnresolve={onUnresolve}
                    onGoToChapter={onGoToChapter}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
