'use client';

import { useRef, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Trash2, AlertTriangle, RotateCcw, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { fadeUp } from '@/lib/animations';
import { BrassButton, useConfirm } from '@/components/antiquarian';
import { useToast } from '@/components/toast';
import { useCharacterChat } from '@/hooks/use-character-chat';
import type { EvolvedState } from '@/lib/types/character-chat';
import { ChatModeSelector } from './chat-mode-selector';
import { ChatMessageBubble } from './chat-message-bubble';
import { ChatInput } from './chat-input';
import { InsightCard } from './insight-card';

interface CharacterChatPanelProps {
  characterId: string;
  characterName: string;
}

const PRESSURE_INDEX: Record<EvolvedState['pressureLevel'], number> = {
  Low: 1,
  Medium: 2,
  High: 3,
  Critical: 4,
};

const INDICATOR_COLOR: Record<EvolvedState['indicator'], string> = {
  'stable': 'bg-forest-500',
  'shifting': 'bg-sepia-400',
  'under pressure': 'bg-brass-500',
  'emotionally conflicted': 'bg-wax-600',
  'at risk of contradiction': 'bg-wax-500',
};

export function CharacterChatPanel({ characterId, characterName }: CharacterChatPanelProps) {
  const t = useTranslations('characterChat');
  const tChar = useTranslations('characters');
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
    liveState,
    contradictions,
  } = useCharacterChat(characterId);

  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const { confirm } = useConfirm();

  const handleClearSession = useCallback(async () => {
    const ok = await confirm({
      title: t('clearConfirmTitle'),
      message: t('clearConfirmMessage', { name: characterName }),
      variant: 'danger',
    });
    if (ok) clearSession();
  }, [confirm, t, characterName, clearSession]);

  const handleSaveInsight = useCallback((insightId: string) => {
    saveInsightAsCanon(insightId);
    toast(t('canonSavedToast'), 'success');
  }, [saveInsightAsCanon, toast, t]);

  // Y9: scroll etiquette — follow new messages only while the reader is
  // near the bottom; someone scrolled up rereading stays where they are.
  const nearBottomRef = useRef(true);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 140;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (scrollRef.current && nearBottomRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="flex flex-col h-[calc(100vh-12rem)] bg-parchment-100 rounded-xl border border-sepia-300/40 overflow-hidden texture-parchment">
      {/* Header */}
      <div className="px-4 py-3 border-b border-sepia-300/30 bg-parchment-200/60">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-forest-700/15 flex items-center justify-center text-forest-700 font-serif font-bold text-lg">
              {characterName.charAt(0).toUpperCase()}
            </div>
            <h2 className="text-2xl font-serif font-bold text-sepia-900 tracking-tight">
              {characterName}
            </h2>
          </div>
          <BrassButton onClick={handleClearSession} className="text-xs" aria-label={t('clearSessionAria')}>
            <Trash2 size={14} aria-hidden="true" />
          </BrassButton>
        </div>
        <ChatModeSelector activeMode={mode} onModeChange={setMode} />

        {/* Living state — a pressure meter + indicator that shifts as the
            character reacts to the conversation. */}
        {liveState && (
          <div className="mt-2 flex items-center gap-2">
            <div
              className="flex items-center gap-0.5"
              role="meter"
              aria-valuemin={1}
              aria-valuemax={4}
              aria-valuenow={PRESSURE_INDEX[liveState.pressureLevel]}
              aria-label={t('pressureMeterAria', {
                name: characterName,
                level: tChar(`pressure.${liveState.pressureLevel}`),
              })}
            >
              {[1, 2, 3, 4].map(seg => (
                <span
                  key={seg}
                  className={`h-1.5 w-5 rounded-full transition-colors ${
                    seg <= PRESSURE_INDEX[liveState.pressureLevel]
                      ? INDICATOR_COLOR[liveState.indicator]
                      : 'bg-sepia-300/40'
                  }`}
                />
              ))}
            </div>
            <span className="text-[11px] font-medium text-sepia-800">
              {tChar(`indicator.${liveState.indicator}`)}
            </span>
            {liveState.emotionalState && (
              <span className="text-[11px] italic text-sepia-600 truncate">
                — {liveState.emotionalState}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="text-center text-sepia-600/80 text-sm py-12">
            {t('startConversation', { name: characterName, mode: t(`modes.${mode}`) })}
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
          <motion.div {...fadeUp} className="flex justify-start mb-3">
            <div className="px-4 py-2.5 rounded-xl bg-parchment-200 border border-sepia-300/30">
              <span className="text-sepia-600 text-sm animate-pulse">{t('thinking')}</span>
            </div>
          </motion.div>
        )}
      </div>

      {/* Insights */}
      {insights.length > 0 && (
        <div className="px-4 py-2 border-t border-sepia-300/30 max-h-40 overflow-y-auto">
          <p className="text-[10px] text-brass-700 uppercase tracking-widest mb-1">{t('insightsHeading')}</p>
          <div className="space-y-2">
            {insights.map(insight => (
              <InsightCard
                key={insight.id}
                insight={insight}
                onSaveAsCanon={handleSaveInsight}
              />
            ))}
          </div>
        </div>
      )}

      {/* Canon contradiction flag — the character broke established canon */}
      <AnimatePresence initial={false}>
      {contradictions.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          className="px-4 py-2 border-t border-brass-500/40 bg-brass-500/10"
        >
          <p className="text-[10px] uppercase tracking-widest text-brass-700 mb-1 flex items-center gap-1">
            <AlertTriangle size={12} aria-hidden="true" /> {t('contradictionHeading')}
          </p>
          <ul className="space-y-1">
            {contradictions.map((c, i) => (
              <li key={i} className="text-[12px] leading-snug text-sepia-800">
                <span className="text-sepia-900 font-medium">{c.fact}</span>
                <span className="text-sepia-700"> — {c.explanation}</span>
              </li>
            ))}
          </ul>
        </motion.div>
      )}
      </AnimatePresence>

      {/* CB-09: insight unavailable hint — non-blocking, antiquarian-styled */}
      {lastInsightError && (
        <div className="px-4 py-2 border-t border-sepia-300/30">
          <p className="text-[11px] italic text-sepia-600">
            {t('oracleUnavailable')}
          </p>
        </div>
      )}

      {/* Send failure — visible + retryable (replaces the old silent revert) */}
      {error && (
        <div role="alert" className="px-4 py-3 border-t border-wax-500/30 bg-wax-500/10">
          <div className="flex items-start gap-2">
            <AlertTriangle size={15} aria-hidden="true" className="mt-0.5 shrink-0 text-wax-600" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-wax-800">
                {error.notConfigured
                  ? t('notConfigured')
                  : t('noResponse')}
              </p>
              <p className="text-xs text-sepia-600 mt-0.5">{error.message}</p>
              <div className="flex items-center gap-3 mt-2">
                {!error.notConfigured && (
                  <button
                    onClick={retry}
                    className="inline-flex items-center gap-1 text-xs font-medium text-brass-700 hover:text-brass-900"
                  >
                    <RotateCcw size={12} aria-hidden="true" /> {t('tryAgain')}
                  </button>
                )}
                <button
                  onClick={clearError}
                  className="inline-flex items-center gap-1 text-xs text-sepia-600 hover:text-sepia-800"
                >
                  <X size={12} aria-hidden="true" /> {t('dismiss')}
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
