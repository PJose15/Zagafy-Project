'use client';

import { motion, AnimatePresence } from 'motion/react';
import { X, RefreshCw, Lightbulb } from 'lucide-react';
import { CoachingInsightCard } from './coaching-insight-card';
import { CoachLensFilter } from './coach-lens-filter';
import { useState } from 'react';
import type { CoachingInsight, CoachingLens } from '@/lib/story-coach/types';

interface CoachPanelProps {
  insights: CoachingInsight[];
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
  onDismiss: (insightId: string) => void;
  onClose: () => void;
}

export function CoachPanel({ insights, isLoading, error, onRefresh, onDismiss, onClose }: CoachPanelProps) {
  const [activeLens, setActiveLens] = useState<CoachingLens | 'all'>('all');

  const filtered = activeLens === 'all'
    ? insights
    : insights.filter(i => i.lens === activeLens);

  // Sort by priority: high first
  const sorted = [...filtered].sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return order[a.priority] - order[b.priority];
  });

  return (
    <AnimatePresence>
      {/* M4: Click-outside backdrop on mobile to dismiss panel */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/30 z-[154] md:hidden"
        onClick={onClose}
        aria-hidden="true"
      />
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="fixed top-0 right-0 bottom-0 w-full md:w-96 bg-parchment-100 border-l border-sepia-300/40 shadow-xl z-[155] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-sepia-300/30">
          <div className="flex items-center gap-2">
            <Lightbulb size={16} className="text-brass-500" />
            <h2 className="text-sm font-serif font-semibold text-sepia-900">Story Coach</h2>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={onRefresh}
              disabled={isLoading}
              className="p-1.5 text-sepia-600 hover:text-sepia-700 rounded-lg hover:bg-parchment-200 transition-colors disabled:opacity-50"
              aria-label="Refresh insights"
            >
              <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-sepia-600 hover:text-sepia-700 rounded-lg hover:bg-parchment-200 transition-colors"
              aria-label="Close coach panel"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Lens Filter */}
        <div className="px-4 py-2 border-b border-sepia-300/20">
          <CoachLensFilter activeLens={activeLens} onChange={setActiveLens} />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {isLoading && sorted.length === 0 && (
            <div className="space-y-3" aria-label="Loading insights">
              {[0, 1, 2].map(i => (
                <div key={i} className="rounded-lg border border-sepia-300/20 p-3 space-y-2">
                  <div className="h-3 w-24 rounded bg-sepia-200/60 animate-pulse" />
                  <div className="h-2.5 w-full rounded bg-sepia-200/40 animate-pulse" />
                  <div className="h-2.5 w-3/4 rounded bg-sepia-200/40 animate-pulse" />
                </div>
              ))}
              <p className="text-center text-sm text-sepia-600 pt-1">Analyzing your chapter...</p>
            </div>
          )}

          {error && (
            <div className="text-sm text-wax-600 bg-wax-500/10 rounded-lg p-3">{error}</div>
          )}

          {!isLoading && sorted.length === 0 && !error && (
            <div className="text-center py-12">
              <Lightbulb size={24} className="mx-auto text-sepia-300 mb-2" />
              <p className="text-sm text-sepia-600">No insights yet. Click refresh to analyze your chapter.</p>
            </div>
          )}

          {sorted.map(insight => (
            <CoachingInsightCard
              key={insight.id}
              insight={insight}
              onDismiss={() => onDismiss(insight.id)}
            />
          ))}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
