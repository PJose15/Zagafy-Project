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

    // Cancel any in-flight request
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

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
          generateInsight: shouldGenerateInsight,
        }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        throw new Error(`Chat failed: ${res.status}`);
      }

      const data = await res.json();

      const charMsg: CharacterChatMessage = {
        id: crypto.randomUUID(),
        role: 'character',
        content: data.reply,
        timestamp: new Date().toISOString(),
        mode,
      };

      const finalMessages = [...updatedMessages, charMsg];
      setMessages(finalMessages);
      updateChatSession(session.id, {
        messages: finalMessages,
        updatedAt: new Date().toISOString(),
      });

      // Handle insight (CB-09: server may signal insightError instead of insight)
      if (data.insight) {
        setLastInsightError(null);
        const newInsight: CharacterInsight = {
          id: crypto.randomUUID(),
          characterId,
          sessionId: session.id,
          content: data.insight,
          savedAsCanon: false,
          createdAt: new Date().toISOString(),
        };
        addInsight(newInsight);
        setInsights(prev => [...prev, newInsight]);
      } else if (data.insightError) {
        setLastInsightError(data.insightError as CharacterInsightErrorReason);
      } else if (shouldGenerateInsight) {
        // No insight and no error means the server didn't try (no upstream
        // call). Clear any prior error so the UI returns to neutral.
        setLastInsightError(null);
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      // Remove the optimistic user message on failure
      setMessages(messages);
    } finally {
      setIsLoading(false);
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
  };
}
