'use client';

import { useEffect, useState, useCallback } from 'react';
import { Pin, PinOff, Trash2, RefreshCw } from 'lucide-react';
import {
  readWriterInsights,
  deleteInsight,
  setInsightPinned,
  refreshConfidences,
  clearAllInsights,
  type WriterInsight,
} from '@/lib/writer-memory';
import { useConfirm } from '@/components/antiquarian/parchment-modal';

const CATEGORY_TONE: Record<string, string> = {
  pacing: 'text-brass-700',
  dialogue: 'text-forest-700',
  description: 'text-sepia-700',
  plot: 'text-wax-700',
  voice: 'text-mahogany-700',
};

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(ts).toLocaleDateString();
}

export function WriterMemoryCard() {
  const [insights, setInsights] = useState<WriterInsight[] | null>(null);
  const { confirm } = useConfirm();

  const refresh = useCallback(async () => {
    await refreshConfidences();
    setInsights(await readWriterInsights());
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await refreshConfidences();
      const list = await readWriterInsights();
      if (!cancelled) setInsights(list);
    })();
    return () => { cancelled = true; };
  }, []);

  const handleTogglePin = async (insight: WriterInsight) => {
    await setInsightPinned(insight.id, !insight.pinned);
    await refresh();
  };

  const handleDelete = async (insight: WriterInsight) => {
    await deleteInsight(insight.id);
    await refresh();
  };

  const handleClearAll = async () => {
    if (!insights || insights.length === 0) return;
    const ok = await confirm({
      title: 'Clear writer memory?',
      message: `Forget all ${insights.length} observations the AI coach has built up about your craft? This cannot be undone.`,
      confirmLabel: 'Forget all',
      variant: 'danger',
    });
    if (!ok) return;
    await clearAllInsights();
    await refresh();
  };

  if (insights === null) {
    return <p className="text-sm text-sepia-500 italic">Loading…</p>;
  }

  if (insights.length === 0) {
    return (
      <p className="text-sm text-sepia-500" data-testid="writer-memory-empty">
        Run the story coach on a chapter to start building a memory of your craft.
      </p>
    );
  }

  return (
    <div className="space-y-3" data-testid="writer-memory-card">
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={handleClearAll}
          className="text-[10px] uppercase tracking-wider text-sepia-500 hover:text-wax-600 transition-colors"
        >
          Clear memory
        </button>
      </div>
      <ul className="space-y-2">
        {insights.map(i => (
          <li
            key={i.id}
            className="flex items-start gap-3 p-3 rounded-lg border border-sepia-300/30 bg-parchment-100/60"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-[10px] uppercase tracking-wider font-mono ${CATEGORY_TONE[i.category] ?? 'text-sepia-500'}`}>
                  {i.category}
                </span>
                <span className="text-[10px] text-sepia-400 font-mono">
                  conf {(i.confidence * 100).toFixed(0)}% · {i.evidenceCount}× · {formatRelative(i.lastObservedAt)}
                </span>
              </div>
              <p className="text-sm text-sepia-800 mt-1">{i.observation}</p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => handleTogglePin(i)}
                className={`p-1.5 rounded-md transition-colors ${
                  i.pinned
                    ? 'text-brass-600 bg-brass-500/10'
                    : 'text-sepia-500 hover:text-brass-600 hover:bg-brass-500/10'
                }`}
                aria-label={i.pinned ? 'Unpin insight' : 'Pin insight'}
                title={i.pinned ? 'Pinned — always injected into prompts' : 'Pin to prioritize this insight in prompts'}
              >
                {i.pinned ? <Pin size={14} /> : <PinOff size={14} />}
              </button>
              <button
                type="button"
                onClick={() => handleDelete(i)}
                className="p-1.5 rounded-md text-sepia-500 hover:text-wax-600 hover:bg-wax-500/10 transition-colors"
                aria-label="Forget insight"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-end pt-1">
        <button
          type="button"
          onClick={refresh}
          className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-sepia-500 hover:text-sepia-800 transition-colors"
          aria-label="Refresh confidences"
        >
          <RefreshCw size={10} /> Recompute
        </button>
      </div>
    </div>
  );
}
