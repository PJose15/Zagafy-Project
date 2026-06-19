'use client';

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { StoreSkeleton } from '@/components/antiquarian/StoreSkeleton';
import {
  migrateFromLocalStorage,
  getAllChapterContents,
  putChapterContent,
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
      setState(loaded);
      setIsLoaded(true);
    }

    loadState();
  }, []);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saveError, setSaveError] = useState(false);
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
    saveTimerRef.current = setTimeout(async () => {
      const projectId = activeProjectIdRef.current;
      try {
        // Save full state (minus chapter content) to Dexie stories table
        const stateForStore = {
          ...state,
          chapters: state.chapters.map(ch => ({ ...ch, content: '' })),
        };
        const totalWords = state.chapters.reduce(
          (sum, ch) => sum + (ch.content ? countWords(ch.content) : 0),
          0,
        );
        await putStory(stateForStore as unknown as Record<string, unknown>, {
          projectId,
          wordCount: totalWords,
        });

        // Save chapter contents to Dexie (separate table, best-effort)
        await Promise.all(
          state.chapters.map(ch =>
            putChapterContent(ch.id, ch.content, ch.title, ch.summary, ch.canonStatus, ch.source, projectId).catch(() => {
              // Individual chapter write failed — content remains in memory
            })
          )
        );

        if (saveError) setSaveError(false);

        // Record sync deltas for cloud push (non-blocking, best-effort)
        recordDelta('story', projectId, 'upsert').catch(() => {});
        for (const ch of state.chapters) {
          recordDelta('chapter', ch.id, 'upsert').catch(() => {});
        }
        notifySyncWrite();

        // Notify other tabs
        try {
          channelRef.current?.postMessage({ type: 'state-updated', at: Date.now() });
        } catch {
          // BroadcastChannel post failures are non-fatal
        }
      } catch {
        if (!saveError) setSaveError(true);
      }
    }, 500);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [state, isLoaded, saveError, notifySyncWrite]);

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
        hydrateFromDexie(activeProjectIdRef.current).then(next => {
          lastRemoteStateRef.current = next;
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
      activeProjectIdRef.current = id;
      hydrateFromDexie(id).then(next => {
        lastRemoteStateRef.current = next;
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
  }, []);

  const updateField = useCallback(<K extends keyof StoryState>(field: K, value: StoryState[K]) => {
    setState((prev) => ({ ...prev, [field]: value }));
  }, []);

  if (!isLoaded) {
    return <StoreSkeleton />;
  }

  return (
    <StoryContext.Provider value={{ state, setState, updateField }}>
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
