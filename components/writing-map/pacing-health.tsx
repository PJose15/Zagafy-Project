'use client';

import { useMemo } from 'react';
import { useStory } from '@/lib/store';
import {
  pacingVariance,
  pacingHealthStatus,
  type PacingHealthStatus,
} from '@/lib/analytics/pacing';
import { useReadingTimeLabel } from '@/lib/i18n/useReadingTimeLabel';
import { wordCount } from '@/lib/editor/serialization';

const STATUS_COPY: Record<PacingHealthStatus, { label: string; description: string; tone: string }> = {
  consistent: {
    label: 'Consistent',
    description: 'Chapters feel evenly paced.',
    tone: 'text-forest-700',
  },
  varied: {
    label: 'Varied',
    description: 'Some chapters run longer than others — usually fine.',
    tone: 'text-brass-600',
  },
  erratic: {
    label: 'Erratic',
    description: 'Chapter lengths swing widely. Worth a structural pass.',
    tone: 'text-wax-600',
  },
};

export function PacingHealth() {
  const { state } = useStory();
  const readingTime = useReadingTimeLabel();

  const data = useMemo(() => {
    const chapters = state.chapters
      .filter(c => c.canonStatus !== 'discarded')
      .map(c => ({ id: c.id, title: c.title, wordCount: wordCount(c.content) }));
    const variance = pacingVariance(chapters);
    return { chapters, variance };
  }, [state.chapters]);

  if (data.chapters.length === 0) {
    return (
      <p className="text-sm text-sepia-600" data-testid="pacing-empty">
        Add chapters to see how their lengths compare.
      </p>
    );
  }

  const { chapters, variance } = data;
  const status = pacingHealthStatus(variance.coefficientOfVariation);
  const max = Math.max(1, ...chapters.map(c => c.wordCount));
  const meanLeftPct = max === 0 ? 0 : Math.min(100, (variance.mean / max) * 100);
  const lowerBandPct =
    max === 0 ? 0 : Math.max(0, Math.min(100, ((variance.mean - variance.stdDev) / max) * 100));
  const upperBandPct =
    max === 0 ? 0 : Math.max(0, Math.min(100, ((variance.mean + variance.stdDev) / max) * 100));

  const copy = STATUS_COPY[status];

  return (
    <div className="space-y-4" data-testid="pacing-health">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
        <div>
          <p className={`text-sm font-medium ${copy.tone}`}>Pacing: {copy.label}</p>
          <p className="text-xs text-sepia-600">{copy.description}</p>
        </div>
        <div className="text-xs font-mono text-sepia-600">
          mean {Math.round(variance.mean).toLocaleString()} words ·{' '}
          {readingTime(Math.round(variance.mean))} ·{' '}
          σ {Math.round(variance.stdDev).toLocaleString()} ·{' '}
          cv {variance.coefficientOfVariation.toFixed(2)}
        </div>
      </div>

      <ul className="space-y-1" aria-label="Chapter word-count bars">
        {chapters.map(ch => {
          const pct = max === 0 ? 0 : Math.min(100, (ch.wordCount / max) * 100);
          return (
            <li key={ch.id} className="relative">
              <div className="flex items-center gap-2 text-xs">
                <span className="w-32 truncate text-sepia-700">{ch.title}</span>
                <div className="relative flex-1 h-3 bg-parchment-200 rounded">
                  {variance.stdDev > 0 && (
                    <div
                      aria-hidden
                      className="absolute top-0 bottom-0 bg-sepia-300/30 rounded"
                      style={{ left: `${lowerBandPct}%`, width: `${Math.max(0, upperBandPct - lowerBandPct)}%` }}
                    />
                  )}
                  <div
                    className="absolute top-0 bottom-0 left-0 bg-brass-400/70 rounded"
                    style={{ width: `${pct}%` }}
                    role="presentation"
                  />
                  <div
                    aria-hidden
                    className="absolute top-0 bottom-0 w-px bg-sepia-700/60"
                    style={{ left: `${meanLeftPct}%` }}
                    title={`mean ${Math.round(variance.mean)} words`}
                  />
                </div>
                <span className="w-20 text-right text-sepia-600 font-mono">
                  {ch.wordCount.toLocaleString()}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
