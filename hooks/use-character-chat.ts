'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ChatMode,
  CharacterChatMessage,
  CharacterChatSession,
  CharacterInsight,
  readChatSessions,
  updateChatSession,
  addChatSession,
  readInsights,
  addInsight,
  markInsightAsCanon as markCanon,
} from '@/lib/types/character-chat';
import { useStory } from '@/lib/store';

export type CharacterInsightErrorReason = 'timeout' | 'parse_error' | 'rate_limited' | 'upstream_error';

export function useCharacterChat(characterId: string | null) {
  const { state } = useStory();
  const [session, setSession] = useState<CharacterChatSession | null>(null);
  const [messages, setMessages] = useState<CharacterChatMessage[]>([]);
  const [mode, setModeState] = useState<ChatMode>('exploration');
  const [isLoading, setIsLoading] = useState(false);
  const [insights, setInsights] = useState<CharacterInsight[]>([]);
  const [lastInsightError, setLastInsightError] = useState<CharacterInsightErrorReason | null>(null);
  // Surfaced when a send fails so the chat shows a clear message instead of the
  // user's message silently vanishing. `notConfigured` means the server is
  // missing ANTHROPIC_API_KEY; `lastInput` lets the UI offer a one-click retry.
  const [error, setError] = useState<{ message: string; notConfigured: boolean; lastInput: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Load or create session when characterId changes
  useEffect(() => {
    if (!characterId) {
      setSession(null);
      setMessages([]);
      setInsights([]);
      return;
    }

    const sessions = readChatSessions();
    const existing = sessions.find(s => s.characterId === characterId);
    if (existing) {
      setSession(existing);
      setMessages(existing.messages);
      setModeState(existing.mode);
    } else {
      const character = state.characters.find(c => c.id === characterId);
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
  }, [characterId, state.characters]);

  // Cross-tab sync
  useEffect(() => {
    function handleStorage(e: StorageEvent) {
      if (e.key === 'zagafy_character_chats' && session) {
        const sessions = readChatSessions();
        const updated = sessions.find(s => s.id === session.id);
        if (updated) {
          setSession(updated);
          setMessages(updated.messages);
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
  }, [session, characterId]);

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
        currentState: character.currentState,
      };

      const res = await fetch('/api/character-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: content.trim(),
          mode,
          character: characterPayload,
          messages: updatedMessages.map(m => ({ role: m.role, content: m.content })),
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
  }, [session, characterId, messages, mode, state.characters]);

  const saveInsightAsCanon = useCallback((insightId: string) => {
    markCanon(insightId);
    setInsights(prev => prev.map(i => i.id === insightId ? { ...i, savedAsCanon: true } : i));
  }, []);

  const clearSession = useCallback(() => {
    if (!session) return;
    const cleared: CharacterChatMessage[] = [];
    setMessages(cleared);
    updateChatSession(session.id, { messages: cleared, updatedAt: new Date().toISOString() });
  }, [session]);

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
  };
}
