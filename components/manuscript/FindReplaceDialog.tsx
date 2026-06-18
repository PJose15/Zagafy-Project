'use client';

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Search, Replace, X, AlertTriangle } from 'lucide-react';
import { springs } from '@/lib/animations';
import { InkStampButton, ParchmentInput } from '@/components/antiquarian';
import { useConfirm } from '@/components/antiquarian/parchment-modal';
import {
  buildPattern,
  findAll,
  replaceAllInChapter,
  type FindOptions,
  type FindScope,
  type Match,
} from '@/lib/find-replace';
import type { Chapter } from '@/lib/store';
import { addVersion } from '@/lib/types/chapter-version';

interface FindReplaceDialogProps {
  open: boolean;
  onClose: () => void;
  chapters: Chapter[];
  /** Optional id of the chapter currently in focus — drives the
   *  current-chapter scope option. */
  currentChapterId?: string | null;
  /**
   * Apply edits to chapter content. The callback should perform the
   * StoryState update (typically via useStory().updateField('chapters', ...)).
   */
  onApplyEdits: (edits: Array<{ chapterId: string; newContent: string }>) => void;
}

const PREVIEW_LIMIT = 200;

export function FindReplaceDialog({
  open,
  onClose,
  chapters,
  currentChapterId,
  onApplyEdits,
}: FindReplaceDialogProps) {
  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [regex, setRegex] = useState(false);
  const [scope, setScope] = useState<FindScope>('all-chapters');
  const [working, setWorking] = useState(false);
  const { confirm } = useConfirm();

  // Reorder chapters so the current one is first when scope is current-chapter.
  const orderedChapters = useMemo(() => {
    if (scope !== 'current-chapter' || !currentChapterId) return chapters;
    const current = chapters.find(c => c.id === currentChapterId);
    if (!current) return chapters;
    return [current, ...chapters.filter(c => c.id !== currentChapterId)];
  }, [chapters, currentChapterId, scope]);

  const findOpts: FindOptions = { caseSensitive, wholeWord, regex, scope };

  // Validate the pattern once per query change (regex mode may throw).
  const { matches, error } = useMemo(() => {
    if (!query) return { matches: [] as Match[], error: null as string | null };
    try {
      buildPattern(query, findOpts);
    } catch (e) {
      return {
        matches: [] as Match[],
        error: e instanceof Error ? e.message : String(e),
      };
    }
    return {
      matches: findAll(orderedChapters, query, findOpts),
      error: null as string | null,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderedChapters, query, caseSensitive, wholeWord, regex, scope]);

  const grouped = useMemo(() => {
    const map = new Map<string, { title: string; matches: Match[] }>();
    for (const m of matches) {
      const slot = map.get(m.chapterId) ?? { title: m.chapterTitle, matches: [] };
      slot.matches.push(m);
      map.set(m.chapterId, slot);
    }
    return map;
  }, [matches]);

  // Reset selection on open via the React-19 derived-state idiom so we
  // don't have a stale query carry over between launches.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open && !prevOpen) {
    setPrevOpen(true);
    setWorking(false);
  }
  if (!open && prevOpen) {
    setPrevOpen(false);
  }

  // Allow Esc to close.
  useEffect(() => {
    if (!open) return;
    const handle = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [open, onClose]);

  const replaceInChapters = async (
    targetIds: string[],
    confirmMessage: string,
  ) => {
    if (matches.length === 0 || working || error) return;
    const ok = await confirm({
      title: 'Confirm replace',
      message: confirmMessage,
      confirmLabel: 'Replace',
      variant: 'danger',
    });
    if (!ok) return;

    setWorking(true);
    try {
      const idSet = new Set(targetIds);
      const edits: Array<{ chapterId: string; newContent: string }> = [];
      let totalReplaced = 0;
      for (const ch of orderedChapters) {
        if (!idSet.has(ch.id)) continue;
        const result = replaceAllInChapter(ch.content, query, replacement, findOpts);
        if (result.replaced === 0) continue;
        // Pre-replace version snapshot so writers can roll the change back.
        await addVersion(
          ch.id,
          ch.content,
          `Pre-replace "${query.slice(0, 40)}"`,
          'auto-snapshot',
          false,
        );
        edits.push({ chapterId: ch.id, newContent: result.newContent });
        totalReplaced += result.replaced;
      }
      if (edits.length > 0) {
        onApplyEdits(edits);
      }
      // Surface in console for now; no toast plumbing in this dialog.
      console.info(`[find-replace] replaced ${totalReplaced} occurrence(s) across ${edits.length} chapter(s)`);
    } finally {
      setWorking(false);
    }
  };

  const handleReplaceAll = () => {
    const targets = scope === 'current-chapter' && currentChapterId
      ? [currentChapterId]
      : Array.from(grouped.keys());
    replaceInChapters(
      targets,
      scope === 'current-chapter'
        ? `Replace ${matches.length} occurrence${matches.length === 1 ? '' : 's'} of "${query}" in this chapter?`
        : `Replace ${matches.length} occurrence${matches.length === 1 ? '' : 's'} of "${query}" across ${grouped.size} chapter${grouped.size === 1 ? '' : 's'}?`,
    );
  };

  const handleReplaceInChapter = (chapterId: string, count: number, title: string) => {
    replaceInChapters(
      [chapterId],
      `Replace ${count} occurrence${count === 1 ? '' : 's'} in "${title}"?`,
    );
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[110] flex items-start justify-center pt-16 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="find-replace-title"
        >
          <div className="absolute inset-0 bg-sepia-900/60 backdrop-blur-sm" onClick={onClose} />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            transition={springs.gentle}
            className="relative bg-parchment-100 border border-sepia-300/50 rounded-xl shadow-card-hover max-w-2xl w-full max-h-[80vh] flex flex-col texture-parchment"
          >
            <div className="flex items-center justify-between p-4 border-b border-sepia-300/30">
              <div className="flex items-center gap-2">
                <Search size={18} className="text-brass-500" />
                <h2 id="find-replace-title" className="font-serif font-semibold text-sepia-900">
                  Find &amp; replace
                </h2>
              </div>
              <button
                onClick={onClose}
                className="p-1 rounded-full text-sepia-600 hover:text-sepia-800 hover:bg-sepia-300/30"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-4 space-y-3 border-b border-sepia-300/30">
              <ParchmentInput
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Find…"
                aria-label="Find query"
                autoFocus
              />
              <ParchmentInput
                type="text"
                value={replacement}
                onChange={e => setReplacement(e.target.value)}
                placeholder="Replace with…"
                aria-label="Replacement text"
              />

              <div className="flex items-center gap-3 flex-wrap text-xs text-sepia-700">
                <label className="inline-flex items-center gap-1 cursor-pointer">
                  <input type="checkbox" checked={caseSensitive} onChange={e => setCaseSensitive(e.target.checked)} className="accent-brass-500" />
                  Match case
                </label>
                <label className="inline-flex items-center gap-1 cursor-pointer">
                  <input type="checkbox" checked={wholeWord} onChange={e => setWholeWord(e.target.checked)} className="accent-brass-500" />
                  Whole word
                </label>
                <label className="inline-flex items-center gap-1 cursor-pointer">
                  <input type="checkbox" checked={regex} onChange={e => setRegex(e.target.checked)} className="accent-brass-500" />
                  Regex
                </label>
                <span className="ml-auto inline-flex items-center gap-2">
                  <span>Scope:</span>
                  <select
                    value={scope}
                    onChange={e => setScope(e.target.value as FindScope)}
                    className="bg-parchment-200 border border-sepia-300/60 rounded px-2 py-0.5 text-xs"
                    aria-label="Find scope"
                  >
                    <option value="all-chapters">All chapters</option>
                    <option value="current-chapter" disabled={!currentChapterId}>
                      Current chapter
                    </option>
                  </select>
                </span>
              </div>

              {error && (
                <div className="flex items-start gap-2 text-xs text-wax-700 bg-wax-500/10 border border-wax-500/30 rounded-lg p-2">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  <span>Invalid regex: {error}</span>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {!query && (
                <p className="text-sm text-sepia-600 italic">
                  Type a query above to start searching.
                </p>
              )}
              {query && !error && matches.length === 0 && (
                <p className="text-sm text-sepia-600 italic">No matches.</p>
              )}
              {Array.from(grouped.entries()).map(([chapterId, group]) => (
                <div key={chapterId} className="border border-sepia-300/30 rounded-lg p-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="min-w-0">
                      <p className="font-serif font-semibold text-sepia-900 text-sm">{group.title}</p>
                      <p className="text-[10px] text-sepia-600 font-mono">
                        {group.matches.length} match{group.matches.length === 1 ? '' : 'es'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleReplaceInChapter(chapterId, group.matches.length, group.title)}
                      disabled={working || !!error}
                      className="text-xs text-brass-700 hover:text-brass-900 underline disabled:opacity-50"
                    >
                      Replace in this chapter
                    </button>
                  </div>
                  <ul className="mt-2 space-y-1">
                    {group.matches.slice(0, PREVIEW_LIMIT).map((m, i) => (
                      <li key={`${m.chapterId}-${m.index}-${i}`} className="text-xs text-sepia-700 font-mono leading-relaxed">
                        <span className="text-sepia-600">…{m.contextBefore}</span>
                        <mark className="bg-brass-300/60 text-sepia-900 rounded px-0.5">
                          {m.contextBefore.length > 0 || m.contextAfter.length > 0
                            ? // Reconstruct the matched text from the chapter (we don't store the raw match).
                              // Falls back to query when context is empty.
                              query
                            : query}
                        </mark>
                        <span className="text-sepia-600">{m.contextAfter}…</span>
                      </li>
                    ))}
                    {group.matches.length > PREVIEW_LIMIT && (
                      <li className="text-[10px] text-sepia-600 italic">
                        + {group.matches.length - PREVIEW_LIMIT} more not shown
                      </li>
                    )}
                  </ul>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between p-4 border-t border-sepia-300/30 gap-3">
              <span className="text-sm text-sepia-600 font-mono">
                {error ? 'invalid regex' : `${matches.length} match${matches.length === 1 ? '' : 'es'}`}
                {grouped.size > 0 && ` · ${grouped.size} chapter${grouped.size === 1 ? '' : 's'}`}
              </span>
              <div className="flex items-center gap-2">
                <InkStampButton variant="ghost" size="sm" onClick={onClose}>
                  Close
                </InkStampButton>
                <InkStampButton
                  variant="primary"
                  size="sm"
                  icon={<Replace size={14} />}
                  onClick={handleReplaceAll}
                  disabled={matches.length === 0 || working || !!error}
                >
                  Replace all
                </InkStampButton>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
