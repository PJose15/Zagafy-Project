'use client';

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { StoreSkeleton } from '@/components/antiquarian/StoreSkeleton';
import {
  migrateFromLocalStorage,
  getAllChapterContents,
  putChapterContent,
  deleteChapterContent,
  getStory,
  putStory,
} from '@/lib/storage/dexie-db';
import type { WorldBibleSection } from '@/lib/types/world-bible';
import { recordDelta } from '@/lib/sync/sync-queue';
import { useSync } from '@/lib/sync/sync-context';
import { wordCount as countWords } from '@/lib/editor/serialization';
import {
  getActiveProjectId,
  PROJECT_CHANGED,
  PROJECT_CHANGED_EVENT,
} from '@/lib/projects/active-project';

const SYNC_CHANNEL = 'zagafy_sync';

export type CanonStatus = 'confirmed' | 'flexible' | 'draft' | 'discarded';
export type DataSource = 'manuscript' | 'ai-inferred' | 'user-entered';

export interface Chapter {
  id: string;
  title: string;
  content: string;
  summary: string;
  canonStatus?: CanonStatus;
  source?: DataSource;
}

export interface Scene {
  id: string;
  chapterId: string;
  title: string;
  content: string;
  summary: string;
  canonStatus?: CanonStatus;
  source?: DataSource;
}

export interface CharacterState {
  emotionalState: string;
  visibleGoal: string;
  hiddenNeed: string;
  currentFear: string;
  dominantBelief: string;
  emotionalWound: string;
  pressureLevel: 'Low' | 'Medium' | 'High' | 'Critical';
  currentKnowledge: string;
  indicator: 'stable' | 'shifting' | 'under pressure' | 'emotionally conflicted' | 'at risk of contradiction';
}

export interface CharacterStateHistory {
  id: string;
  date: string;
  context: string;
  changes: string;
}

export interface CharacterRelationship {
  targetId: string;
  trustLevel: number;
  tensionLevel: number;
  dynamics: string;
}

export interface Character {
  id: string;
  name: string;
  role: string;
  description: string;
  coreIdentity?: string;
  relationships: string;
  dynamicRelationships?: CharacterRelationship[];
  currentState?: CharacterState;
  stateHistory?: CharacterStateHistory[];
  canonStatus?: CanonStatus;
  source?: DataSource;
}

export interface TimelineEvent {
  id: string;
  date: string;
  description: string;
  impact: string;
  canonStatus?: CanonStatus;
  source?: DataSource;
}

export interface OpenLoop {
  id: string;
  description: string;
  status: 'open' | 'closed';
  canonStatus?: CanonStatus;
  source?: DataSource;
}

export interface WorldRule {
  id: string;
  category: string;
  rule: string;
  canonStatus?: CanonStatus;
  source?: DataSource;
}

export interface Conflict {
  id: string;
  title: string;
  description: string;
  status: 'active' | 'resolved';
  canonStatus?: CanonStatus;
  source?: DataSource;
}

export interface Foreshadowing {
  id: string;
  clue: string;
  payoff: string;
  canonStatus?: CanonStatus;
  source?: DataSource;
}

export interface Location {
  id: string;
  name: string;
  description: string;
  importance: string;
  associatedRules: string[];
  canonStatus?: CanonStatus;
  source?: DataSource;
}

export interface Theme {
  id: string;
  theme: string;
  evidence: string[];
  canonStatus?: CanonStatus;
  source?: DataSource;
}

export interface CanonItem {
  id: string;
  category: string;
  description: string;
  status: string;
  sourceReference: string;
}

export interface Ambiguity {
  id: string;
  issue: string;
  affectedSection: string;
  confidence: string;
  recommendedReview: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isBlockedMode?: boolean;
  structured?: Record<string, unknown>;
}

export interface StoryState {
  language: string;
  title: string;
  genre: string[];
  synopsis: string;
  author_intent: string;
  /** MP-04 — manuscript export title-page metadata (Shunn standard format). */
  author_name: string;
  author_email: string;
  author_address: string;
  chapters: Chapter[];
  scenes: Scene[];
  characters: Character[];
  timeline_events: TimelineEvent[];
  open_loops: OpenLoop[];
  world_rules: WorldRule[];
  style_profile: string;
  active_conflicts: Conflict[];
  foreshadowing_elements: Foreshadowing[];
  locations: Location[];
  themes: Theme[];
  canon_items: CanonItem[];
  ambiguities: Ambiguity[];
  chat_messages: ChatMessage[];
  world_bible: WorldBibleSection[];
}

export const defaultState: StoryState = {
  language: 'English',
  title: 'Untitled Project',
  genre: [],
  synopsis: '',
  author_intent: '',
  author_name: '',
  author_email: '',
  author_address: '',
  chapters: [],
  scenes: [],
  characters: [],
  timeline_events: [],
  open_loops: [],
  world_rules: [],
  style_profile: '',
  active_conflicts: [],
  foreshadowing_elements: [],
  locations: [],
  themes: [],
  canon_items: [],
  ambiguities: [],
  chat_messages: [],
  world_bible: [],
};

interface StoryContextType {
  state: StoryState;
  setState: React.Dispatch<React.SetStateAction<StoryState>>;
  updateField: <K extends keyof StoryState>(field: K, value: StoryState[K]) => void;
  /**
   * Persist immediately (bypassing the 500ms debounce) and resolve when the
   * Dexie write completes. Pass the exact state to save; the store also adopts
   * it. Used by flows that navigate right after writing (e.g. Genesis) so the
   * next route sees the saved data instead of racing the debounce.
   */
  saveNow: (next?: StoryState) => Promise<void>;
}

const StoryContext = createContext<StoryContextType | undefined>(undefined);

async function hydrateFromDexie(projectId: string = getActiveProjectId()): Promise<StoryState> {
  const saved = await getStory(projectId);
  let loadedState: StoryState = defaultState;
  if (saved) {
    loadedState = { ...defaultState, ...(saved as Partial<StoryState>) };
  }

  // Load chapter contents from Dexie and merge back
  try {
    const contentMap = await getAllChapterContents(projectId);
    if (contentMap.size > 0 && Array.isArray(loadedState.chapters)) {
      loadedState = {
        ...loadedState,
        chapters: loadedState.chapters.map(ch => ({
          ...ch,
          content: contentMap.get(ch.id) ?? ch.content,
        })),
      };
    }
  } catch {
    // Dexie unavailable — chapters keep whatever content they have
  }

  return loadedState;
}

export function StoryProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<StoryState>(defaultState);
  const [isLoaded, setIsLoaded] = useState(false);
  const channelRef = useRef<BroadcastChannel | null>(null);
  // The project the store is currently bound to. Persist writes target this id;
  // a project switch updates it and re-hydrates.
  const activeProjectIdRef = useRef<string>('current');
  const { notifyWrite: notifySyncWrite } = useSync();
  // Tracks the last state snapshot applied from another tab. The persist
  // effect compares by reference: if state === lastRemoteStateRef.current,
  // we skip persisting (avoid echo loop). Using a snapshot ref instead of a
  // boolean flag closes an edge case where a second remote message arrived
  // before the persist effect ran and the flag had been consumed.
  const lastRemoteStateRef = useRef<StoryState | null>(null);
  // The debounced save captured at scheduling time (state + target project) so
  // a project switch can flush it to the OLD project id and beforeunload can
  // fire it before the tab dies.
  const pendingSaveRef = useRef<{ state: StoryState; projectId: string } | null>(null);
  // Chapter id set from the last persist, per project — diffed on each persist
  // to detect chapter deletions (Dexie row cleanup + sync delete delta).
  const lastPersistedChaptersRef = useRef<{ projectId: string; ids: Set<string> } | null>(null);

  useEffect(() => {
    async function loadState() {
      // Run Dexie migration first (idempotent). This also moves any legacy
      // localStorage state blob into the Dexie stories table.
      await migrateFromLocalStorage();

      // Legacy rename: copy story_memory_state → zagafy_state if it still exists
      // so the migration function picks it up on a second pass.
      try {
        if (typeof localStorage !== 'undefined' && localStorage.getItem('story_memory_state')) {
          if (!localStorage.getItem('zagafy_state')) {
            localStorage.setItem('zagafy_state', localStorage.getItem('story_memory_state')!);
          }
          localStorage.removeItem('story_memory_state');
          await migrateFromLocalStorage();
        }
      } catch {
        // Ignore — legacy cleanup is best-effort
      }

      const activeId = getActiveProjectId();
      activeProjectIdRef.current = activeId;

      // Guarantee the active project has a stories row so it appears in the
      // project library even before its first save (fresh / just-migrated user).
      if ((await getStory(activeId)) === null) {
        await putStory({ ...defaultState } as unknown as Record<string, unknown>, { projectId: activeId });
      }

      const loaded = await hydrateFromDexie(activeId);
      lastPersistedChaptersRef.current = {
        projectId: activeId,
        ids: new Set(loaded.chapters.map(ch => ch.id)),
      };
      setState(loaded);
      setIsLoaded(true);
    }

    loadState();
  }, []);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saveError, setSaveError] = useState(false);

  // Core persistence: write one project's state (blob + chapter contents) to
  // Dexie, record sync deltas, and notify other tabs. Shared by the debounced
  // autosave and the imperative saveNow().
  const persistState = useCallback(async (next: StoryState, projectId: string) => {
    // Chapter deletions only mutate the in-memory array — diff against the
    // last-persisted id set so removed chapters are deleted from Dexie and
    // queued as sync deletes. Ref is swapped synchronously (before any await)
    // so an interleaved project-switch flush never diffs the wrong project.
    const prevChapters = lastPersistedChaptersRef.current;
    const currentIds = new Set(next.chapters.map(ch => ch.id));
    lastPersistedChaptersRef.current = { projectId, ids: currentIds };
    if (prevChapters && prevChapters.projectId === projectId) {
      for (const id of prevChapters.ids) {
        if (!currentIds.has(id)) {
          deleteChapterContent(id).catch(() => {});
          recordDelta('chapter', id, 'delete').catch(() => {});
        }
      }
    }

    const stateForStore = {
      ...next,
      chapters: next.chapters.map(ch => ({ ...ch, content: '' })),
    };
    const totalWords = next.chapters.reduce(
      (sum, ch) => sum + (ch.content ? countWords(ch.content) : 0),
      0,
    );
    await putStory(stateForStore as unknown as Record<string, unknown>, {
      projectId,
      wordCount: totalWords,
    });
    const chapterWrites = await Promise.allSettled(
      next.chapters.map(ch =>
        putChapterContent(ch.id, ch.content, ch.title, ch.summary, ch.canonStatus, ch.source, projectId)
      )
    );
    recordDelta('story', projectId, 'upsert').catch(() => {});
    for (const ch of next.chapters) {
      recordDelta('chapter', ch.id, 'upsert').catch(() => {});
    }
    notifySyncWrite();
    try {
      channelRef.current?.postMessage({ type: 'state-updated', at: Date.now() });
    } catch {
      // BroadcastChannel post failures are non-fatal
    }
    // Surface chapter write failures the same way a putStory failure would —
    // the stripped blob saved fine, so a swallowed chapter write means the
    // chapter resolves to '' on next hydration (silent manuscript loss).
    const failedWrites = chapterWrites.filter(r => r.status === 'rejected').length;
    if (failedWrites > 0) {
      throw new Error(`${failedWrites} chapter content write(s) failed`);
    }
  }, [notifySyncWrite]);

  useEffect(() => {
    if (!isLoaded) return;

    // Skip persisting state we just applied from another tab (avoid echo loop).
    // Reference equality: if the current state IS the snapshot we applied from a
    // remote message, don't re-persist it. The user hasn't made any changes yet.
    if (lastRemoteStateRef.current === state) {
      lastRemoteStateRef.current = null;
      return;
    }

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    // Bind the save to the project active at SCHEDULING time — reading the ref
    // when the timer fires can write project A's state under project B's id if
    // a switch happened mid-debounce.
    const pid = activeProjectIdRef.current;
    pendingSaveRef.current = { state, projectId: pid };
    saveTimerRef.current = setTimeout(async () => {
      pendingSaveRef.current = null;
      try {
        await persistState(state, pid);
        if (saveError) setSaveError(false);
      } catch {
        if (!saveError) setSaveError(true);
      }
    }, 500);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [state, isLoaded, saveError, persistState]);

  // Imperative flush — persist now and resolve when written. Adopts `next` into
  // store state and suppresses the debounce's duplicate write of the same ref.
  const saveNow = useCallback(async (next?: StoryState) => {
    const target = next ?? state;
    if (next) {
      lastRemoteStateRef.current = next;
      setState(next);
    }
    await persistState(target, activeProjectIdRef.current);
  }, [state, persistState]);

  // Cross-tab sync via BroadcastChannel (Dexie writes don't fire storage events)
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;

    let channel: BroadcastChannel;
    try {
      channel = new BroadcastChannel(SYNC_CHANNEL);
    } catch {
      return;
    }
    channelRef.current = channel;

    // Debounce remote hydration so a burst of write-notifications from another
    // tab only triggers one Dexie read.
    let hydrateTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleHydrate = () => {
      if (hydrateTimer) clearTimeout(hydrateTimer);
      hydrateTimer = setTimeout(() => {
        hydrateTimer = null;
        const pid = activeProjectIdRef.current;
        hydrateFromDexie(pid).then(next => {
          lastRemoteStateRef.current = next;
          // Adopt the hydrated chapter set as the deletion-diff baseline so a
          // chapter removed elsewhere isn't re-deleted on the next local save.
          lastPersistedChaptersRef.current = {
            projectId: pid,
            ids: new Set(next.chapters.map(ch => ch.id)),
          };
          setState(next);
        }).catch(() => {
          // Ignore — remote rehydration failed
        });
      }, 250);
    };

    // The active project changed (in this tab or another). Re-bind the store to
    // the now-active project and load its state. Active project is a per-browser
    // value (localStorage), so every tab follows the switch.
    const switchActive = () => {
      const id = getActiveProjectId();
      // Flush any pending debounced save to the OLD project before re-binding —
      // letting the timer fire after the ref moves would write the old
      // project's state under the new project's id.
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      const pending = pendingSaveRef.current;
      if (pending) {
        pendingSaveRef.current = null;
        persistState(pending.state, pending.projectId).catch(() => {});
      }
      activeProjectIdRef.current = id;
      hydrateFromDexie(id).then(next => {
        lastRemoteStateRef.current = next;
        lastPersistedChaptersRef.current = {
          projectId: id,
          ids: new Set(next.chapters.map(ch => ch.id)),
        };
        setState(next);
      }).catch(() => {
        // Ignore — switch hydration failed
      });
    };

    const handleMessage = (e: MessageEvent) => {
      if (!e.data) return;
      if (e.data.type === 'state-updated') scheduleHydrate();
      else if (e.data.type === PROJECT_CHANGED) switchActive();
    };

    channel.addEventListener('message', handleMessage);
    // Same-tab switch signal (BroadcastChannel does not deliver to the poster).
    window.addEventListener(PROJECT_CHANGED_EVENT, switchActive);
    return () => {
      if (hydrateTimer) clearTimeout(hydrateTimer);
      channel.removeEventListener('message', handleMessage);
      window.removeEventListener(PROJECT_CHANGED_EVENT, switchActive);
      channel.close();
      channelRef.current = null;
    };
    // persistState is referentially stable (its only dep is a stable context fn).
  }, [persistState]);

  // Flush the pending debounced save on tab close — best-effort: the async
  // Dexie write is kicked off synchronously and usually completes before the
  // page is torn down.
  useEffect(() => {
    const flushPending = () => {
      const pending = pendingSaveRef.current;
      if (!pending) return;
      pendingSaveRef.current = null;
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      persistState(pending.state, pending.projectId).catch(() => {});
    };
    window.addEventListener('beforeunload', flushPending);
    return () => window.removeEventListener('beforeunload', flushPending);
  }, [persistState]);

  const updateField = useCallback(<K extends keyof StoryState>(field: K, value: StoryState[K]) => {
    setState((prev) => ({ ...prev, [field]: value }));
  }, []);

  if (!isLoaded) {
    return <StoreSkeleton />;
  }

  return (
    <StoryContext.Provider value={{ state, setState, updateField, saveNow }}>
      {saveError && (
        <div className="fixed top-0 left-0 right-0 z-[100] bg-red-900/90 text-red-100 text-sm text-center px-4 py-2 backdrop-blur">
          Storage quota exceeded — your changes may not be saved. Export your project from Settings.
        </div>
      )}
      {children}
    </StoryContext.Provider>
  );
}

export function useStory() {
  const context = useContext(StoryContext);
  if (context === undefined) {
    throw new Error('useStory must be used within a StoryProvider');
  }
  return context;
}
