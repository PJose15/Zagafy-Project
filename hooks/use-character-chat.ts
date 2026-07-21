'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ChatMode,
  CharacterChatMessage,
  CharacterChatSession,
  CharacterInsight,
  EvolvedState,
  StoryContext,
  ContradictionFlag,
  readChatSessions,
  updateChatSession,
  addChatSession,
  readInsights,
  addInsight,
  markInsightAsCanon as markCanon,
  normalizePressureLevel,
  normalizeStateIndicator,
} from '@/lib/types/character-chat';
import { useStory, type CharacterState, type Character, type StoryState, type CanonItem } from '@/lib/store';
import { getPlainText } from '@/lib/editor/serialization';

export type CharacterInsightErrorReason = 'timeout' | 'parse_error' | 'rate_limited' | 'upstream_error';

// Stable send-failure codes — the hook has no t(); the rendering component
// translates these (serverMessage, when present, is shown as-is).
export type CharacterChatErrorCode = 'httpError' | 'emptyReply' | 'networkError';

export interface CharacterChatError {
  code: CharacterChatErrorCode;
  status?: number;
  /** Server-provided detail (already human-readable) — preferred over the code's generic copy. */
  serverMessage?: string;
  notConfigured: boolean;
  lastInput: string;
}

/**
 * Narrow a full CharacterState down to the conversation-evolving slice.
 * pressureLevel/indicator are AI-written and can arrive as free prose —
 * normalize to the enums (falling back to a sane midpoint when a value is
 * present but unrecognized) so i18n lookups and config-map indexes never see
 * junk keys.
 */
function toEvolved(s: Pick<CharacterState, 'emotionalState' | 'pressureLevel' | 'indicator'> | undefined | null): EvolvedState | null {
  if (!s || !s.pressureLevel || !s.indicator) return null;
  return {
    emotionalState: s.emotionalState ?? '',
    pressureLevel: normalizePressureLevel(s.pressureLevel) ?? 'Medium',
    indicator: normalizeStateIndicator(s.indicator) ?? 'shifting',
  };
}

/**
 * Ground the character in the actual story: premise, canon facts (preferring
 * ones that mention this character), and what's happened so far (chapter
 * summaries, or excerpts mentioning them when summaries are absent). Server
 * re-caps everything; these client caps just bound the payload.
 */
function buildStoryContext(state: StoryState, character: Character): StoryContext {
  const premise = [state.title, state.synopsis]
    .map(s => (s || '').trim())
    .filter(Boolean)
    .join(' — ')
    .slice(0, 1500);

  const name = character.name.toLowerCase();
  const allCanon = Array.isArray(state.canon_items) ? state.canon_items : [];
  const relevant = allCanon.filter(c => (c.description || '').toLowerCase().includes(name));
  const canon = (relevant.length ? relevant : allCanon)
    .slice(0, 40)
    .map(c => `${c.category ? `[${c.category}] ` : ''}${(c.description || '').trim()}`.trim())
    .filter(Boolean);

  const chapters = Array.isArray(state.chapters) ? state.chapters : [];
  const summarized = chapters.filter(ch => (ch.summary || '').trim());
  let storySoFar = '';
  if (summarized.length) {
    storySoFar = summarized.map(ch => `${ch.title}: ${ch.summary.trim()}`).join('\n');
  } else {
    const excerpts: string[] = [];
    for (const ch of chapters) {
      // Chapter content may be Lexical JSON (CB-07) — decode so the model
      // receives prose, not serialized editor nodes.
      const text = getPlainText(ch.content || '');
      const idx = text.toLowerCase().indexOf(name);
      if (idx >= 0) {
        const slice = text.slice(Math.max(0, idx - 150), idx + 350).replace(/\s+/g, ' ').trim();
        excerpts.push(`${ch.title}: …${slice}…`);
      }
      if (excerpts.length >= 12) break;
    }
    storySoFar = excerpts.join('\n');
  }
  storySoFar = storySoFar.slice(0, 12000);

  const ctx: StoryContext = {};
  if (premise) ctx.premise = premise;
  if (canon.length) ctx.canon = canon;
  if (storySoFar.trim()) ctx.storySoFar = storySoFar;
  return ctx;
}

export function useCharacterChat(characterId: string | null) {
  const { state, updateField } = useStory();
  const [session, setSession] = useState<CharacterChatSession | null>(null);
  const [messages, setMessages] = useState<CharacterChatMessage[]>([]);
  const [mode, setModeState] = useState<ChatMode>('exploration');
  const [isLoading, setIsLoading] = useState(false);
  // True from send until the reply stream fully completes (or errors).
  // isLoading drops on the first token to hide the "thinking" pulse, so the
  // composer must gate on this too — a send mid-stream would abort stream 1
  // and bake its partial reply into history as if it were complete.
  const [isStreaming, setIsStreaming] = useState(false);
  const [insights, setInsights] = useState<CharacterInsight[]>([]);
  const [lastInsightError, setLastInsightError] = useState<CharacterInsightErrorReason | null>(null);
  // Canon contradictions detected in the most recent reply (Story-Brain check).
  const [contradictions, setContradictions] = useState<ContradictionFlag[]>([]);
  // Surfaced when a send fails so the chat shows a clear message instead of the
  // user's message silently vanishing. `notConfigured` means the server is
  // missing ANTHROPIC_API_KEY; `lastInput` lets the UI offer a one-click retry.
  const [error, setError] = useState<CharacterChatError | null>(null);
  // Living state — the character's conversation-evolving emotional state, shown
  // as a live meter and fed back into the next prompt. Ref mirrors it for reads
  // inside sendMessage without adding a dependency.
  const [liveState, setLiveStateRaw] = useState<EvolvedState | null>(null);
  const liveStateRef = useRef<EvolvedState | null>(null);
  const setLiveState = useCallback((s: EvolvedState | null) => {
    // Normalize on every write — values arrive from persisted sessions and AI
    // responses, either of which can carry non-enum prose.
    const normalized = toEvolved(s);
    liveStateRef.current = normalized;
    setLiveStateRaw(normalized);
  }, []);
  // Durable cross-session memory of past conversations (ref for reads inside
  // sendMessage without a dependency; persisted on the session).
  const memoryRef = useRef<string | undefined>(undefined);
  const abortRef = useRef<AbortController | null>(null);
  // Mirrors the current characterId so async continuations (stream loop,
  // fire-and-forget callbacks) can detect a character switch and never write
  // the old character's data into the new character's panels.
  const characterIdRef = useRef<string | null>(characterId);

  // Abort in-flight work when switching characters; reset transient send state
  // that the load effect below doesn't own. (Kept separate from the load effect
  // so re-runs on state.characters changes don't abort a healthy stream.)
  useEffect(() => {
    if (characterIdRef.current !== characterId) {
      abortRef.current?.abort();
      setIsLoading(false);
      setIsStreaming(false);
      setError(null);
      setContradictions([]);
      setLastInsightError(null);
    }
    characterIdRef.current = characterId;
  }, [characterId]);

  // Abort in-flight work on unmount.
  useEffect(() => () => abortRef.current?.abort(), []);

  // Load or create session when characterId changes
  useEffect(() => {
    if (!characterId) {
      setSession(null);
      setMessages([]);
      setInsights([]);
      setLiveState(null);
      return;
    }

    const sessions = readChatSessions();
    const existing = sessions.find(s => s.characterId === characterId);
    if (existing) {
      setSession(existing);
      setMessages(existing.messages);
      setModeState(existing.mode);
      setLiveState(existing.evolvedState ?? toEvolved(state.characters.find(c => c.id === characterId)?.currentState));
      memoryRef.current = existing.memory;
    } else {
      const character = state.characters.find(c => c.id === characterId);
      setLiveState(toEvolved(character?.currentState));
      memoryRef.current = undefined;
      const newSession: CharacterChatSession = {
        id: crypto.randomUUID(),
        characterId,
        characterName: character?.name || 'Unknown',
        messages: [],
        mode: 'exploration',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      addChatSession(newSession);
      setSession(newSession);
      setMessages([]);
      setModeState('exploration');
    }

    const allInsights = readInsights().filter(i => {
      const sessions2 = readChatSessions();
      const s = sessions2.find(s2 => s2.id === i.sessionId);
      return s?.characterId === characterId;
    });
    setInsights(allInsights);
  }, [characterId, state.characters, setLiveState]);

  // Cross-tab sync
  useEffect(() => {
    function handleStorage(e: StorageEvent) {
      if (e.key === 'zagafy_character_chats' && session) {
        const sessions = readChatSessions();
        const updated = sessions.find(s => s.id === session.id);
        if (updated) {
          setSession(updated);
          setMessages(updated.messages);
          if (updated.evolvedState) setLiveState(updated.evolvedState);
        }
      }
      if (e.key === 'zagafy_character_insights' && characterId) {
        const allInsights = readInsights().filter(i => {
          const sessions = readChatSessions();
          const s = sessions.find(s2 => s2.id === i.sessionId);
          return s?.characterId === characterId;
        });
        setInsights(allInsights);
      }
    }
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [session, characterId, setLiveState]);

  const setMode = useCallback((newMode: ChatMode) => {
    setModeState(newMode);
    if (session) {
      updateChatSession(session.id, { mode: newMode, updatedAt: new Date().toISOString() });
    }
  }, [session]);

  const sendMessage = useCallback(async (content: string) => {
    if (!session || !characterId || !content.trim()) return;

    const character = state.characters.find(c => c.id === characterId);
    if (!character) return;

    // Which character this send belongs to — every setState in the stream loop
    // and the fire-and-forget callbacks below checks this against the ref so a
    // mid-flight character switch can't bleed state across characters.
    // (Persistence to the old session is still allowed to complete.)
    const sentFor = characterId;

    const userMsg: CharacterChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: content.trim(),
      timestamp: new Date().toISOString(),
      mode,
    };

    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setIsLoading(true);
    setIsStreaming(true);
    setError(null);
    setContradictions([]); // clear any flag from the previous reply

    // Cancel any in-flight request
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const characterMessages = updatedMessages.filter(m => m.role === 'character');
      const shouldGenerateInsight = characterMessages.length >= 5;

      // Send a structured character payload — server builds the system prompt
      // server-side from these fields. This prevents the route from being
      // abused as an open Anthropic proxy via a client-supplied systemPrompt.
      const characterPayload = {
        id: character.id,
        name: character.name,
        role: character.role,
        description: character.description,
        coreIdentity: character.coreIdentity,
        relationships: character.relationships,
        // Feed the conversation-evolved state back in so the character continues
        // from its escalated emotional state, not the authored baseline.
        currentState: liveStateRef.current
          ? { ...character.currentState, ...liveStateRef.current }
          : character.currentState,
      };

      const storyContext = buildStoryContext(state, character);

      const res = await fetch('/api/character-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: content.trim(),
          mode,
          character: characterPayload,
          messages: updatedMessages.map(m => ({ role: m.role, content: m.content })),
          storyContext,
          memory: memoryRef.current,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const reason = body?.details?.reason;
        const serverMessage = typeof body?.message === 'string'
          ? body.message
          : typeof body?.error === 'string'
            ? body.error
            : undefined;
        const e = new Error(serverMessage ?? `character-chat error ${res.status}`) as Error & Partial<CharacterChatError>;
        e.code = 'httpError';
        e.status = res.status;
        e.serverMessage = serverMessage;
        e.notConfigured = reason === 'ai_not_configured';
        throw e;
      }

      // The route streams the reply as plain text. Append tokens to a growing
      // character bubble so it types out live instead of appearing all at once.
      const charMsg: CharacterChatMessage = {
        id: crypto.randomUUID(),
        role: 'character',
        content: '',
        timestamp: new Date().toISOString(),
        mode,
      };

      let acc = '';
      let started = false;
      const reader = res.body?.getReader();
      if (reader) {
        const decoder = new TextDecoder();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          acc += decoder.decode(value, { stream: true });
          // A character switch aborts this stream, but a read already in
          // flight can still resolve — never paint into the new chat.
          if (characterIdRef.current !== sentFor) continue;
          if (!started) {
            started = true;
            setIsLoading(false); // first token arrived — drop the "thinking" pulse
          }
          setMessages([...updatedMessages, { ...charMsg, content: acc }]);
        }
      }

      if (!acc.trim()) {
        // Empty stream (refusal / thinking-only / dropped connection) — surface
        // as a retryable error instead of leaving an empty bubble.
        const e = new Error('empty character reply') as Error & Partial<CharacterChatError>;
        e.code = 'emptyReply';
        throw e;
      }

      const finalMessages = [...updatedMessages, { ...charMsg, content: acc }];
      if (characterIdRef.current === sentFor) setMessages(finalMessages);
      updateChatSession(session.id, {
        messages: finalMessages,
        updatedAt: new Date().toISOString(),
      });

      // Insight is generated by a separate, non-blocking request so the reply
      // above is shown immediately and is never lost to the insight call's
      // latency (the old design ran both calls sequentially under one 30s
      // function budget, so deep conversations timed out and dropped the reply).
      // Fire-and-forget: updates `insights` / `lastInsightError` when it resolves.
      if (shouldGenerateInsight) {
        const transcript = finalMessages
          .map(m => `${m.role === 'character' ? 'assistant' : 'user'}: ${m.content}`)
          .join('\n')
          .slice(0, 30_000);
        void (async () => {
          try {
            const ires = await fetch('/api/character-chat/insight', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ characterName: character.name, transcript, language: state.language }),
            });
            if (!ires.ok) {
              if (characterIdRef.current === sentFor) setLastInsightError('upstream_error');
              return;
            }
            const idata = await ires.json();
            if (idata.insight) {
              const newInsight: CharacterInsight = {
                id: crypto.randomUUID(),
                characterId,
                sessionId: session.id,
                content: idata.insight,
                savedAsCanon: false,
                createdAt: new Date().toISOString(),
              };
              addInsight(newInsight); // persist even after a switch — it belongs to the old session
              if (characterIdRef.current !== sentFor) return;
              setLastInsightError(null);
              setInsights(prev => [...prev, newInsight]);
            } else if (idata.insightError) {
              if (characterIdRef.current === sentFor) setLastInsightError(idata.insightError as CharacterInsightErrorReason);
            }
          } catch {
            if (characterIdRef.current === sentFor) setLastInsightError('upstream_error');
          }
        })();
      }

      // Living state — evolve the character's momentary emotional state from
      // this exchange (non-blocking). Updates the live meter and is persisted to
      // the session so it carries across reloads and into the next prompt.
      {
        const stateTranscript = finalMessages
          .map(m => `${m.role === 'character' ? 'assistant' : 'user'}: ${m.content}`)
          .join('\n')
          .slice(0, 30_000);
        const priorState = liveStateRef.current ?? toEvolved(character.currentState);
        void (async () => {
          try {
            const sres = await fetch('/api/character-chat/state', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                characterName: character.name,
                mode,
                transcript: stateTranscript,
                currentState: priorState,
              }),
            });
            if (!sres.ok) return;
            const sdata = await sres.json();
            if (sdata.state) {
              // Guard the live meter (and its ref) — persisting to the old
              // session below is still correct after a switch.
              if (characterIdRef.current === sentFor) setLiveState(sdata.state as EvolvedState);
              updateChatSession(session.id, {
                evolvedState: sdata.state,
                updatedAt: new Date().toISOString(),
              });
            }
          } catch {
            /* non-blocking — leave the meter as-is */
          }
        })();
      }

      // Canon contradiction check — flag when the reply breaks established
      // canon (Story-Brain consistency, applied to dialogue). Non-blocking.
      if (storyContext.canon && storyContext.canon.length) {
        const replyText = acc;
        void (async () => {
          try {
            const cres = await fetch('/api/character-chat/contradiction', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                characterName: character.name,
                reply: replyText,
                canon: storyContext.canon,
              }),
            });
            if (!cres.ok) return;
            const cdata = await cres.json();
            if (characterIdRef.current !== sentFor) return;
            if (Array.isArray(cdata.contradictions) && cdata.contradictions.length) {
              setContradictions(cdata.contradictions as ContradictionFlag[]);
            }
          } catch {
            /* non-blocking — no flag shown */
          }
        })();
      }

      // Cross-session memory — update the durable running memory of past
      // conversations (non-blocking, on the insight cadence to limit calls).
      // Persisted on the session so it survives clears and seeds future chats.
      if (shouldGenerateInsight) {
        const memTranscript = finalMessages
          .map(m => `${m.role === 'character' ? 'assistant' : 'user'}: ${m.content}`)
          .join('\n')
          .slice(0, 30_000);
        const existingMemory = memoryRef.current;
        void (async () => {
          try {
            const mres = await fetch('/api/character-chat/memory', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ characterName: character.name, transcript: memTranscript, existingMemory, language: state.language }),
            });
            if (!mres.ok) return;
            const mdata = await mres.json();
            if (typeof mdata.memory === 'string' && mdata.memory.trim()) {
              // memoryRef belongs to whichever character is now active — only
              // write it if we're still on the one this send was for.
              if (characterIdRef.current === sentFor) memoryRef.current = mdata.memory;
              updateChatSession(session.id, { memory: mdata.memory, updatedAt: new Date().toISOString() });
            }
          } catch {
            /* non-blocking — keep existing memory */
          }
        })();
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      // Stale failure from before a character switch — the new chat owns the UI.
      if (characterIdRef.current !== sentFor) return;
      // Revert the optimistic user message and surface a visible, retryable error
      // (instead of the message silently disappearing).
      setMessages(messages);
      const ex = err as Partial<CharacterChatError>;
      setError({
        code: ex.code ?? 'networkError',
        status: ex.status,
        serverMessage: ex.serverMessage,
        notConfigured: !!ex.notConfigured,
        lastInput: content.trim(),
      });
    } finally {
      // A newer request may have aborted this one; if so, leave the spinner
      // up for the request still in flight instead of clearing it here.
      // Likewise, after a character switch these flags belong to the new chat.
      if (!controller.signal.aborted && characterIdRef.current === sentFor) {
        setIsLoading(false);
        setIsStreaming(false);
      }
    }
  }, [session, characterId, messages, mode, state, setLiveState]);

  const saveInsightAsCanon = useCallback((insightId: string) => {
    markCanon(insightId);
    setInsights(prev => prev.map(i => i.id === insightId ? { ...i, savedAsCanon: true } : i));

    // Actually promote the insight into the story's canon so it grounds/enforces
    // future AI (previously this only flipped a localStorage flag and the insight
    // never reached state.canon_items).
    const insight = insights.find(i => i.id === insightId);
    if (!insight) return;
    const existing = Array.isArray(state.canon_items) ? state.canon_items : [];
    const sourceReference = `character-chat:${insightId}`;
    if (existing.some(c => c.sourceReference === sourceReference)) return; // idempotent
    const character = state.characters.find(c => c.id === insight.characterId);
    const canonItem: CanonItem = {
      id: crypto.randomUUID(),
      category: 'character',
      description: character ? `${character.name}: ${insight.content}` : insight.content,
      status: 'confirmed',
      sourceReference,
    };
    updateField('canon_items', [...existing, canonItem]);
  }, [insights, state.canon_items, state.characters, updateField]);

  const clearSession = useCallback(() => {
    if (!session) return;
    const cleared: CharacterChatMessage[] = [];
    setMessages(cleared);
    setContradictions([]);
    // Reset the evolving state back to the character's authored baseline.
    const baseline = toEvolved(state.characters.find(c => c.id === characterId)?.currentState);
    setLiveState(baseline);
    updateChatSession(session.id, {
      messages: cleared,
      evolvedState: baseline ?? undefined,
      updatedAt: new Date().toISOString(),
    });
  }, [session, characterId, state.characters, setLiveState]);

  const clearError = useCallback(() => setError(null), []);

  const retry = useCallback(() => {
    if (!error) return;
    const input = error.lastInput;
    setError(null);
    sendMessage(input);
  }, [error, sendMessage]);

  return {
    session,
    messages,
    mode,
    setMode,
    sendMessage,
    isLoading,
    isStreaming,
    insights,
    lastInsightError,
    saveInsightAsCanon,
    clearSession,
    error,
    clearError,
    retry,
    liveState,
    contradictions,
  };
}
