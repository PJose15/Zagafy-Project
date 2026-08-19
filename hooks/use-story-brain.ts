'use client';

import { useMemo, useState, useCallback } from 'react';
import { useStory } from '@/lib/store';
import { analyzeStoryState } from '@/lib/story-brain/analyzer';
import { detectInconsistencies } from '@/lib/story-brain/inconsistency-detector';
import { detectPlotHoles } from '@/lib/story-brain/plot-hole-detector';
import {
  getResolutions,
  resolveInconsistency,
  unresolveInconsistency,
} from '@/lib/story-brain/resolutions';
import type { StoryBrainAnalysis, Inconsistency, InconsistencyResolution, ResolutionAction } from '@/lib/story-brain/types';
import type { PlotHole } from '@/lib/story-brain/plot-hole-types';

interface UseStoryBrainReturn {
  analysis: StoryBrainAnalysis;
  inconsistencies: Inconsistency[];
  plotHoles: PlotHole[];
  resolutions: InconsistencyResolution[];
  unresolvedCount: number;
  unresolvedPlotHoleCount: number;
  resolve: (inconsistencyId: string, action: ResolutionAction) => void;
  unresolve: (inconsistencyId: string) => void;
}

export function useStoryBrain(): UseStoryBrainReturn {
  const { state } = useStory();
  const [resolutions, setResolutions] = useState(() => getResolutions());

  // Memoize analysis — only recompute when story state changes.
  // Wrap in try/catch so an analyzer crash on malformed state degrades to an
  // empty analysis instead of unmounting the entire story-brain surface.
  const analysis = useMemo<StoryBrainAnalysis>(() => {
    try {
      return analyzeStoryState(state);
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[useStoryBrain] analyzeStoryState threw:', err);
      }
      return {
        entities: [],
        relationships: [],
        totalMentions: 0,
        entityCountByType: { character: 0, location: 0, event: 0, conflict: 0 },
      };
    }
    // Depend only on the fields analyzeStoryState reads, so unrelated store
    // updates (e.g. chat_messages, autosave content churn on other pages) don't
    // re-run this analysis. `state` itself is intentionally excluded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.characters, state.chapters, state.scenes, state.timeline_events, state.active_conflicts, state.locations]);

  // Memoize inconsistencies — IDs are now deterministic from data
  const inconsistencies = useMemo<Inconsistency[]>(() => {
    try {
      return detectInconsistencies(state, analysis);
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[useStoryBrain] detectInconsistencies threw:', err);
      }
      return [];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.characters, state.chapters, state.scenes, state.timeline_events, state.active_conflicts, analysis]);

  // Memoize plot holes — IDs are now deterministic from data
  const plotHoles = useMemo<PlotHole[]>(() => {
    try {
      return detectPlotHoles(state, analysis);
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[useStoryBrain] detectPlotHoles threw:', err);
      }
      return [];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.chapters, state.characters, state.active_conflicts, state.foreshadowing_elements, state.open_loops, analysis]);

  // Filter out resolved items
  const resolvedIds = useMemo(
    () => new Set(resolutions.map(r => r.inconsistencyId)),
    [resolutions]
  );

  const unresolvedCount = useMemo(
    () => inconsistencies.filter(i => !resolvedIds.has(i.id)).length,
    [inconsistencies, resolvedIds]
  );

  const unresolvedPlotHoleCount = useMemo(
    () => plotHoles.filter(ph => !resolvedIds.has(ph.id)).length,
    [plotHoles, resolvedIds]
  );

  const resolve = useCallback((inconsistencyId: string, action: ResolutionAction) => {
    resolveInconsistency(inconsistencyId, action);
    setResolutions(getResolutions());
  }, []);

  const unresolve = useCallback((inconsistencyId: string) => {
    unresolveInconsistency(inconsistencyId);
    setResolutions(getResolutions());
  }, []);

  return {
    analysis,
    inconsistencies,
    plotHoles,
    resolutions,
    unresolvedCount,
    unresolvedPlotHoleCount,
    resolve,
    unresolve,
  };
}
