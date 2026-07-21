'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { motion } from 'motion/react';
import { Pencil, Target } from 'lucide-react';
import { springs } from '@/lib/animations';
import { useProjects } from '@/hooks/use-projects';

const GOAL_KEY = 'zagafy_word_goal';

/**
 * G16 — the project's word goal: a bar of ink filling toward the target.
 * Click the pencil to set or change the goal; it persists locally, scoped per
 * project (same activeId keying as zagafy_milestones). The legacy unscoped
 * key is read as a fallback so pre-existing goals aren't lost.
 */
export function WordGoalBar({ totalWords }: { totalWords: number }) {
  const t = useTranslations('dashboard');
  const { activeId } = useProjects();
  const goalKey = `${GOAL_KEY}:${activeId || 'default'}`;
  const [goal, setGoal] = useState(0);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    try {
      const raw = Number(localStorage.getItem(goalKey) ?? localStorage.getItem(GOAL_KEY) ?? '0');
      // eslint-disable-next-line react-hooks/set-state-in-effect -- two-pass hydration-safe storage restore
      setGoal(Number.isFinite(raw) && raw > 0 ? raw : 0);
    } catch { /* stays unset */ }
  }, [goalKey]);

  const save = () => {
    const n = Math.max(0, Math.floor(Number(draft)));
    setGoal(n);
    setEditing(false);
    try {
      localStorage.setItem(goalKey, String(n));
    } catch { /* best effort */ }
  };

  const pct = goal > 0 ? Math.min(100, Math.round((totalWords / goal) * 100)) : 0;

  return (
    <div className="rounded-xl border border-sepia-300/40 bg-parchment-100 texture-parchment px-5 py-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Target size={14} aria-hidden="true" className="text-brass-600 shrink-0" />
          <p className="text-sm text-sepia-800 truncate">
            {goal > 0
              ? t('goal.progress', { total: totalWords, goal, pct })
              : t('goal.unset')}
          </p>
        </div>
        {editing ? (
          <form
            onSubmit={e => {
              e.preventDefault();
              save();
            }}
            className="flex items-center gap-2 shrink-0"
          >
            <input
              autoFocus
              inputMode="numeric"
              value={draft}
              onChange={e => setDraft(e.target.value.replace(/[^0-9]/g, ''))}
              onBlur={save}
              className="w-24 rounded-lg border border-sepia-300/60 bg-parchment-200 px-2 py-1 text-right font-mono text-sm text-sepia-900 focus:outline-none focus:ring-2 focus:ring-brass-400/40"
              aria-label={t('goal.inputAria')}
            />
          </form>
        ) : (
          <button
            type="button"
            onClick={() => {
              setDraft(goal > 0 ? String(goal) : '');
              setEditing(true);
            }}
            className="flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-sepia-600 transition-colors hover:bg-sepia-300/20 hover:text-sepia-800"
            aria-label={t('goal.editAria')}
            title={t('goal.editAria')}
          >
            <Pencil size={12} aria-hidden="true" />
            {goal > 0 ? t('goal.edit') : t('goal.set')}
          </button>
        )}
      </div>
      {goal > 0 && (
        <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-sepia-300/30" aria-hidden="true">
          <motion.div
            initial={false}
            animate={{ width: `${pct}%` }}
            transition={springs.gentle}
            className="h-full rounded-full bg-gradient-to-r from-brass-600 to-brass-400"
          />
        </div>
      )}
    </div>
  );
}
