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
} from '@/lib/types/character-chat';
import { useStory, type CharacterState, type Character, type StoryState } from '@/lib/store';

export type CharacterInsightErrorReason = 'timeout' | 'parse_error' | 'rate_limited' | 'upstream_error';

/** Narrow a full CharacterState down to the conversation-evolving slice. */
function toEvolved(s: CharacterState | undefined): EvolvedState | null {
  if (!s || !s.pressureLevel || !s.indicator) return null;
  return { emotionalState: s.emotionalState ?? '', pressureLevel: s.pressureLevel, indicator: s.indicator };
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
      const text = ch.content || '';
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
  const { state } = useStory();
  const [session, setSession] = useState<CharacterChatSession | null>(null);
  const [messages, setMessages] = useState<CharacterChatMessage[]>([]);
  const [mode, setModeState] = useState<ChatMode>('exploration');
  const [isLoading, setIsLoading] = useState(false);
  const [insights, setInsights] = useState<CharacterInsight[]>([]);
  const [lastInsightError, setLastInsightError] = useState<CharacterInsightErrorReason | null>(null);
  // Canon contradictions detected in the most recent reply (Story-Brain check).
  const [contradictions, setContradictions] = useState<ContradictionFlag[]>([]);
  // Surfaced when a send fails so the chat shows a clear message instead of the
  // user's message silently vanishing. `notConfigured` means the server is
  // missing ANTHROPIC_API_KEY; `lastInput` lets the UI offer a one-click retry.
  const [error, setError] = useState<{ message: string; notConfigured: boolean; lastInput: string } | null>(null);
  // Living state — the character's conversation-evolving emotional state, shown
  // as a live meter and fed back into the next prompt. Ref mirrors it for reads
  // inside sendMessage without adding a dependency.
  const [liveState, setLiveStateRaw] = useState<EvolvedState | null>(null);
  const liveStateRef = useRef<EvolvedState | null>(null);
  const setLiveState = useCallback((s: EvolvedState | null) => {
    liveStateRef.current = s;
    setLiveStateRaw(s);
  }, []);
  const abortRef = useRef<AbortController | null>(null);

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
    } else {
      const character = state.characters.find(c => c.id === characterId);
      setLiveState(toEvolved(character?.currentState));
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
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const reason = body?.details?.reason;
        const message = typeof body?.message === 'string'
          ? body.message
          : typeof body?.error === 'string'
            ? body.error
            : `The character couldn't respond (error ${res.status}).`;
        const e = new Error(message) as Error & { notConfigured?: boolean };
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
        throw new Error("The character couldn't respond. Please try again.");
      }

      const finalMessages = [...updatedMessages, { ...charMsg, content: acc }];
      setMessages(finalMessages);
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
              body: JSON.stringify({ characterName: character.name, transcript }),
            });
            if (!ires.ok) {
              setLastInsightError('upstream_error');
              return;
            }
            const idata = await ires.json();
            if (idata.insight) {
              setLastInsightError(null);
              const newInsight: CharacterInsight = {
                id: crypto.randomUUID(),
                characterId,
                sessionId: session.id,
                content: idata.insight,
                savedAsCanon: false,
                createdAt: new Date().toISOString(),
              };
              addInsight(newInsight);
              setInsights(prev => [...prev, newInsight]);
            } else if (idata.insightError) {
              setLastInsightError(idata.insightError as CharacterInsightErrorReason);
            }
          } catch {
            setLastInsightError('upstream_error');
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
              setLiveState(sdata.state as EvolvedState);
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
            if (Array.isArray(cdata.contradictions) && cdata.contradictions.length) {
              setContradictions(cdata.contradictions as ContradictionFlag[]);
            }
          } catch {
            /* non-blocking — no flag shown */
          }
        })();
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      // Revert the optimistic user message and surface a visible, retryable error
      // (instead of the message silently disappearing).
      setMessages(messages);
      const message = err instanceof Error ? err.message : 'Something went wrong reaching the character.';
      const notConfigured = !!(err as { notConfigured?: boolean })?.notConfigured;
      setError({ message, notConfigured, lastInput: content.trim() });
    } finally {
      // A newer request may have aborted this one; if so, leave the spinner
      // up for the request still in flight instead of clearing it here.
      if (!controller.signal.aborted) setIsLoading(false);
    }
  }, [session, characterId, messages, mode, state, setLiveState]);

  const saveInsightAsCanon = useCallback((insightId: string) => {
    markCanon(insightId);
    setInsights(prev => prev.map(i => i.id === insightId ? { ...i, savedAsCanon: true } : i));
  }, []);

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
