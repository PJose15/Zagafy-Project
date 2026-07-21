'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useStory } from '@/lib/store';
import { useToast } from '@/components/toast';
import { wordCount } from '@/lib/editor/serialization';
import { useProjects } from '@/hooks/use-projects';

const MILESTONES = [1000, 5000, 10000, 25000, 50000, 100000];
const STORAGE_KEY = 'zagafy_milestones';

type SeenMap = Record<string, number[]>;

function readSeen(): SeenMap {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

/**
 * A4 — word milestones: when the manuscript's total crosses a round number
 * through actual writing, a gold moment marks it. Each milestone fires once
 * per project (localStorage ledger). Large jumps (hydration, imports) are
 * recorded silently so returning writers aren't spammed for old ground.
 */
export function useWordMilestones() {
  const { state } = useStory();
  const { toast } = useToast();
  const { activeId } = useProjects();
  const t = useTranslations('milestones');
  const prevRef = useRef<number | null>(null);

  // Memoized — this hook lives in the app shell, so an unmemoized reduce
  // would re-parse every chapter's Lexical JSON on each shell render.
  const total = useMemo(
    () => state.chapters.reduce((sum, c) => sum + wordCount(c.content), 0),
    [state.chapters],
  );

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = total;
    if (prev === null || total <= prev) return;

    const projectKey = activeId || 'default';
    const seen = readSeen();
    const reached = new Set(seen[projectKey] ?? []);
    const crossed = MILESTONES.filter(m => prev < m && m <= total && !reached.has(m));
    if (crossed.length === 0) return;

    crossed.forEach(m => reached.add(m));
    seen[projectKey] = [...reached];
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(seen));
    } catch {
      /* full/blocked storage never breaks the moment */
    }

    // Only celebrate crossings earned by writing this session — a jump of
    // thousands of words is a data load or import, not a milestone moment.
    const earned = prev > 0 && total - prev < 5000;
    if (earned) {
      toast(t('reached', { count: crossed[crossed.length - 1] }), 'success');
    }
  }, [total, activeId, toast, t]);
}
