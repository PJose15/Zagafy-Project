'use client';

import { useRef, useEffect } from 'react';
import { Trash2, AlertTriangle, RotateCcw, X } from 'lucide-react';
import { CarvedHeader, BrassButton } from '@/components/antiquarian';
import { useCharacterChat } from '@/hooks/use-character-chat';
import { ChatModeSelector } from './chat-mode-selector';
import { ChatMessageBubble } from './chat-message-bubble';
import { ChatInput } from './chat-input';
import { InsightCard } from './insight-card';

interface CharacterChatPanelProps {
  characterId: string;
  characterName: string;
}

export function CharacterChatPanel({ characterId, characterName }: CharacterChatPanelProps) {
  const {
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
  } = useCharacterChat(characterId);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="flex flex-col h-[calc(100vh-12rem)] bg-mahogany-900/30 rounded-xl border border-mahogany-700/30 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-mahogany-700/30 bg-mahogany-900/50">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-forest-700/30 flex items-center justify-center text-forest-300 font-serif font-bold text-lg">
              {characterName.charAt(0).toUpperCase()}
            </div>
            <CarvedHeader title={characterName} />
          </div>
          <BrassButton onClick={clearSession} className="text-xs">
            <Trash2 size={14} />
          </BrassButton>
        </div>
        <ChatModeSelector activeMode={mode} onModeChange={setMode} />
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="text-center text-cream-400/40 text-sm py-12">
            Start a conversation with {characterName} in {mode} mode.
          </div>
        )}
        {messages.map(msg => (
          <ChatMessageBubble
            key={msg.id}
            message={msg}
            characterName={characterName}
          />
        ))}
        {isLoading && (
          <div className="flex justify-start mb-3">
            <div className="px-4 py-2.5 rounded-xl bg-cream-100/10 border border-cream-200/10">
              <span className="text-cream-400/60 text-sm animate-pulse">Thinking...</span>
            </div>
          </div>
        )}
      </div>

      {/* Insights */}
      {insights.length > 0 && (
        <div className="px-4 py-2 border-t border-mahogany-700/30 max-h-40 overflow-y-auto">
          <p className="text-[10px] text-brass-400/60 uppercase tracking-widest mb-1">Insights</p>
          <div className="space-y-2">
            {insights.map(insight => (
              <InsightCard
                key={insight.id}
                insight={insight}
                onSaveAsCanon={saveInsightAsCanon}
              />
            ))}
          </div>
        </div>
      )}

      {/* CB-09: insight unavailable hint — non-blocking, antiquarian-styled */}
      {lastInsightError && (
        <div className="px-4 py-2 border-t border-mahogany-700/30">
          <p className="text-[11px] italic text-cream-400/60">
            The oracle could not see clearly this turn. Try again later.
          </p>
        </div>
      )}

      {/* Send failure — visible + retryable (replaces the old silent revert) */}
      {error && (
        <div role="alert" className="px-4 py-3 border-t border-wax-500/30 bg-wax-500/10">
          <div className="flex items-start gap-2">
            <AlertTriangle size={15} aria-hidden="true" className="mt-0.5 shrink-0 text-wax-400" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-wax-200">
                {error.notConfigured
                  ? 'Character Chat isn’t configured on this deployment yet.'
                  : 'The character couldn’t respond.'}
              </p>
              <p className="text-xs text-cream-400/70 mt-0.5">{error.message}</p>
              <div className="flex items-center gap-3 mt-2">
                {!error.notConfigured && (
                  <button
                    onClick={retry}
                    className="inline-flex items-center gap-1 text-xs font-medium text-brass-300 hover:text-brass-200"
                  >
                    <RotateCcw size={12} aria-hidden="true" /> Try again
                  </button>
                )}
                <button
                  onClick={clearError}
                  className="inline-flex items-center gap-1 text-xs text-cream-400/60 hover:text-cream-300"
                >
                  <X size={12} aria-hidden="true" /> Dismiss
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Input */}
      <ChatInput onSend={sendMessage} isLoading={isLoading} />
    </div>
  );
}
