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

// Coerce a persisted (possibly corrupt or older-schema) blob into a valid
// StoryState: every array field falls back to its default when the stored value
// isn't an array, so a single bad row can't crash the app on hydration.
function coerceStoryState(saved: Partial<StoryState>): StoryState {
  const merged = { ...defaultState, ...saved } as Record<string, unknown>;
  for (const key of Object.keys(defaultState) as (keyof StoryState)[]) {
    if (Array.isArray(defaultState[key]) && !Array.isArray(merged[key as string])) {
      merged[key as string] = defaultState[key];
    }
  }
  return merged as unknown as StoryState;
}

async function hydrateFromDexie(): Promise<StoryState> {
  const saved = await getStory();
  let loadedState: StoryState = defaultState;
  if (saved) {
    loadedState = coerceStoryState(saved as Partial<StoryState>);
  }

  // Load chapter contents from Dexie and merge back
  try {
    const contentMap = await getAllChapterContents();
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
  // Tracks the last state snapshot applied from another tab. The persist
  // effect compares by reference: if state === lastRemoteStateRef.current,
  // we skip persisting (avoid echo loop). Using a snapshot ref instead of a
  // boolean flag closes an edge case where a second remote message arrived
  // before the persist effect ran and the flag had been consumed.
  const lastRemoteStateRef = useRef<StoryState | null>(null);
  // True while this tab has local edits that haven't been persisted yet. When a
  // remote (other-tab) snapshot arrives, we refuse to overwrite our own unsaved
  // work with it — the pending local save will broadcast and other tabs converge.
  const localDirtyRef = useRef(false);

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

      const loaded = await hydrateFromDexie();
       
      setState(loaded);
      setIsLoaded(true);
    }

    loadState();
  }, []);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saveError, setSaveError] = useState(false);
  // Read saveError via a ref inside the persist effect so toggling it doesn't
  // re-run the effect (which would schedule one redundant re-save after recovery).
  const saveErrorRef = useRef(saveError);
  useEffect(() => {
    saveErrorRef.current = saveError;
  }, [saveError]);
  useEffect(() => {
    if (!isLoaded) return;

    // Skip persisting state we just applied from another tab (avoid echo loop).
    // Reference equality: if the current state IS the snapshot we applied from a
    // remote message, don't re-persist it. The user hasn't made any changes yet.
    if (lastRemoteStateRef.current === state) {
      lastRemoteStateRef.current = null;
      return;
    }

    // Genuine local change → this tab now holds unsaved edits.
    localDirtyRef.current = true;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        // Save chapter contents to Dexie (separate table) FIRST, tracking which
        // writes fail. Content is the large payload, so it's what fails under
        // quota pressure — we must know the failures before we decide whether it
        // is safe to strip content from the story blob.
        const failedChapterIds = new Set<string>();
        await Promise.all(
          state.chapters.map(ch =>
            putChapterContent(ch.id, ch.content, ch.title, ch.summary, ch.canonStatus, ch.source).catch(() => {
              // This chapter's dedicated content write failed — remember it so we
              // keep its content inline in the blob below instead of losing it.
              failedChapterIds.add(ch.id);
            })
          )
        );

        // Save full state to the Dexie stories table. Strip content ONLY for
        // chapters whose dedicated content write succeeded; for any that failed,
        // keep the content inline in the blob so a reload can still recover it.
        const stateForStore = {
          ...state,
          chapters: state.chapters.map(ch =>
            failedChapterIds.has(ch.id) ? { ...ch } : { ...ch, content: '' }
          ),
        };
        await putStory(stateForStore as unknown as Record<string, unknown>);

        // Local edits are now durable — this tab is no longer "dirty", so an
        // incoming remote snapshot may safely be applied again.
        localDirtyRef.current = false;

        // If any chapter content failed to persist to its own table, surface the
        // save-error banner even though the blob write itself succeeded — the
        // user's newest prose is at risk and they must know.
        if (failedChapterIds.size > 0) {
          if (!saveErrorRef.current) setSaveError(true);
        } else if (saveErrorRef.current) {
          setSaveError(false);
        }

        // Notify other tabs
        try {
          channelRef.current?.postMessage({ type: 'state-updated', at: Date.now() });
        } catch {
          // BroadcastChannel post failures are non-fatal
        }
      } catch {
        if (!saveErrorRef.current) setSaveError(true);
      }
    }, 500);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [state, isLoaded]);

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
        // Don't overwrite our own unsaved local edits with another tab's snapshot.
        // The pending local save will broadcast and other tabs will converge to it.
        if (localDirtyRef.current) return;
        hydrateFromDexie().then(next => {
          lastRemoteStateRef.current = next;
          setState(next);
        }).catch(() => {
          // Ignore — remote rehydration failed
        });
      }, 250);
    };

    const handleMessage = (e: MessageEvent) => {
      if (!e.data || e.data.type !== 'state-updated') return;
      scheduleHydrate();
    };

    channel.addEventListener('message', handleMessage);
    return () => {
      if (hydrateTimer) clearTimeout(hydrateTimer);
      channel.removeEventListener('message', handleMessage);
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
        <div
          role="alert"
          aria-live="assertive"
          className="fixed top-0 left-0 right-0 z-[100] bg-red-900/90 text-red-100 text-sm text-center px-4 py-2 backdrop-blur"
        >
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
