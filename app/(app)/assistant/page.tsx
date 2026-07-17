'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useStory, ChatMessage } from '@/lib/store';
import { useSession } from '@/lib/session';
import { Send, User, Loader2, ShieldAlert, X, AlertTriangle, CheckCircle2, LockKeyhole, Trash2, Feather, BookOpen, ChevronUp } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Lazy-load react-markdown. Only used as a legacy fallback for messages
// without structured data; most replies render via StructuredNormal/Blocked
// which also dynamic-import Markdown. Keeps remark/rehype/micromark off the
// /assistant First Load JS.
const Markdown = dynamic(() => import('react-markdown'), {
  ssr: false,
  loading: () => <span className="text-xs italic text-sepia-600">…</span>,
});
import { useToast } from '@/components/toast';
import { useConfirm } from '@/components/confirm-dialog';
import { buildContext } from '@/lib/ai/context-builder';
import { isBlockedResponse, isNormalResponse, type ChatResponseNormal, type ChatResponseBlocked } from '@/lib/types/chat-response';
import { StructuredNormalResponse, StructuredBlockedResponse } from '@/components/assistant/structured-response';
import { CarvedHeader, ParchmentCard, BrassButton, InkStampButton, DecorativeDivider, FeatureErrorBoundary } from '@/components/antiquarian';
import { springs, fadeUp, passedNote } from '@/lib/animations';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isThinking?: boolean;
  isBlockedMode?: boolean;
  structured?: Record<string, unknown>;
}

interface AuditRisk {
  level: 'Low' | 'Medium' | 'High';
  description: string;
  affectedElements: string[];
}

interface AuditResult {
  status: 'Clear' | 'Warnings' | 'Contradictions';
  risks: AuditRisk[];
  suggestedCorrections: string[];
  safeVersion: string;
}

// ─── Ink Dots Loading Animation ───
function InkDotsLoader() {
  return (
    <span className="inline-flex items-center gap-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-brass-500"
          style={{
            animation: `ink-pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
          }}
        />
      ))}
      <style>{`
        @keyframes ink-pulse {
          0%, 80%, 100% { opacity: 0.25; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1.2); }
        }
      `}</style>
    </span>
  );
}

// ─── Audit Status Badge ───
function AuditStatusBadge({ status }: { status: AuditResult['status'] }) {
  const t = useTranslations('assistant');
  const config = {
    Clear: { bg: 'bg-forest-700/15', text: 'text-forest-800', border: 'border-forest-600/30', icon: CheckCircle2 },
    Warnings: { bg: 'bg-brass-500/15', text: 'text-brass-800', border: 'border-brass-500/30', icon: AlertTriangle },
    Contradictions: { bg: 'bg-wax-500/15', text: 'text-wax-800', border: 'border-wax-500/30', icon: ShieldAlert },
  };
  const c = config[status];
  const Icon = c.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold uppercase tracking-wider border ${c.bg} ${c.text} ${c.border}`}>
      <Icon size={14} />
      {t(`auditStatus.${status}`)}
    </span>
  );
}

// ─── Risk Level Badge ───
function RiskBadge({ level }: { level: AuditRisk['level'] }) {
  const t = useTranslations('assistant');
  const styles = {
    High: 'bg-wax-500/20 text-wax-700 border-wax-500/30',
    Medium: 'bg-brass-500/20 text-brass-700 border-brass-500/30',
    Low: 'bg-brass-400/15 text-brass-600 border-brass-400/30',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider border ${styles[level]}`}>
      {t(`riskLevel.${level}`)}
    </span>
  );
}

export default function AssistantPage() {
  const t = useTranslations('assistant');
  const { state, updateField } = useStory();
  const { session } = useSession();
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const welcomeMessage = useMemo<Message>(
    () => ({ id: 'welcome', role: 'assistant', content: t('welcome') }),
    [t],
  );
  const [messages, setMessages] = useState<Message[]>(() => [welcomeMessage]);
  const hasLoadedRef = useRef(false);
  // Render window: show only the tail of the conversation to avoid rendering
  // thousands of Markdown bubbles + motion nodes. User can expand in chunks.
  const MESSAGE_WINDOW_INITIAL = 50;
  const MESSAGE_WINDOW_STEP = 50;
  const [visibleCount, setVisibleCount] = useState(MESSAGE_WINDOW_INITIAL);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isAuditing, setIsAuditing] = useState(false);
  const [pendingAudit, setPendingAudit] = useState<{ request: string; result: AuditResult } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Load saved messages from store on mount
  useEffect(() => {
    if (!hasLoadedRef.current) {
      if (state.chat_messages.length > 0) {
        setMessages(state.chat_messages.map(m => ({ ...m })));
      }
      hasLoadedRef.current = true;
    }
  }, [state.chat_messages]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Derived window: last N messages, with count of hidden older messages
  const { windowedMessages, hiddenCount } = useMemo(() => {
    const total = messages.length;
    const shown = Math.min(visibleCount, total);
    return {
      windowedMessages: messages.slice(total - shown),
      hiddenCount: total - shown,
    };
  }, [messages, visibleCount]);

  const handleLoadEarlier = () => {
    setVisibleCount((n) => n + MESSAGE_WINDOW_STEP);
  };

  // Abort any in-flight request on unmount
  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  // Persist chat messages to store (strip isThinking) — only after initial load
  // Cap at 100 messages to prevent localStorage from growing indefinitely
  useEffect(() => {
    if (!hasLoadedRef.current) return;
    const persistable: ChatMessage[] = messages
      .filter(m => !m.isThinking)
      .slice(-100)
      .map(({ id, role, content, isBlockedMode, structured }) => ({ id, role, content, isBlockedMode, structured }));
    updateField('chat_messages', persistable);
  }, [messages]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleClearChat = async () => {
    if (messages.length <= 1) return;
    const confirmed = await confirm({
      title: t('clearConfirmTitle'),
      message: t('clearConfirmMessage'),
      confirmLabel: t('clearConfirmLabel'),
      variant: 'danger',
    });
    if (!confirmed) return;
    setMessages([welcomeMessage]);
    setPendingAudit(null);
    setVisibleCount(MESSAGE_WINDOW_INITIAL);
  };

  const handleAudit = async () => {
    if (!input.trim() || isLoading || isAuditing) return;

    setIsAuditing(true);

    try {
      const { context } = buildContext(state, {
        userInput: input,
        isBlockedMode: false,
        writerBlockType: session.blockType,
      });
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      const res = await fetch('/api/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storyContext: context,
          userInput: input,
          language: state.language || 'English',
        }),
        signal: abortRef.current.signal,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || t('auditFailed'));
      }
      const result = await res.json();
      setPendingAudit({ request: input, result });

    } catch {
      toast(t('auditError'), 'error');
    } finally {
      setIsAuditing(false);
    }
  };

  const handleSend = async (overrideInput?: string) => {
    const textToSend = overrideInput || input;
    if (!textToSend.trim() || isLoading) return;

    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: textToSend };
    setMessages((prev) => [...prev, userMsg]);
    if (!overrideInput) setInput('');
    setIsLoading(true);

    const BLOCKED_PHRASES = [
      "i'm blocked", 'im blocked', "i'm stuck", 'im stuck',
      'i feel blocked', 'i feel stuck',
      'unblock me', 'help me continue',
      "i don't know what happens next", 'i dont know what happens next',
      "i don't know what to write", 'i dont know what to write',
      "writer's block", 'writers block',
      'help me get unstuck', 'what should i write',
      'where do i go from here', "i have no idea",
      "i'm lost", 'im lost', 'feeling stuck', 'feeling blocked',
      "can't write", 'cant write', "can't continue", 'cant continue',
      // Spanish equivalents — so the localized quick prompts (and Spanish-typed
      // input) trigger blocked mode the same way the English phrases do.
      'estoy bloqueado', 'estoy atascado', 'me siento bloqueado', 'me siento atascado',
      'ayúdame a continuar', 'ayudame a continuar', 'ayúdame a desbloquearme', 'ayudame a desbloquearme',
      'no sé qué escribir', 'no se que escribir', 'no sé qué pasa después', 'no se que pasa despues',
      'bloqueo del escritor', 'no puedo escribir', 'no puedo continuar',
      'estoy perdido', 'qué debo escribir', 'que debo escribir',
    ];

    const inputLower = textToSend.toLowerCase();
    const BLOCKED_KEYWORDS = ['blocked', 'stuck', 'lost', 'help', 'bloqueado', 'atascado', 'perdido', 'ayuda'];
    const isBlockedRequest = BLOCKED_PHRASES.some(phrase => inputLower.includes(phrase))
      || (session?.blockType && BLOCKED_KEYWORDS.some(kw => inputLower.includes(kw)));

    try {
      const { context, knownEntities } = buildContext(state, {
        userInput: textToSend,
        isBlockedMode: !!isBlockedRequest,
        writerBlockType: session.blockType,
      });

      // Build multi-turn history from recent messages (last 10 turns = 20 messages)
      const recentMessages = messages.filter(m => m.id !== 'welcome').slice(-20);
      const chatHistory = recentMessages.map(m => ({
        role: m.role,
        content: m.content,
      }));

      abortRef.current?.abort();
      abortRef.current = new AbortController();
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storyContext: context,
          userInput: textToSend,
          isBlockedRequest,
          language: state.language || 'English',
          chatHistory,
          knownEntities,
          blockType: session.blockType,
        }),
        signal: abortRef.current.signal,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || t('chatFailed'));
      }
      const data = await res.json();

      const assistantMsg: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.text,
        isBlockedMode: data.isBlockedMode,
        structured: data.structured,
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (error: unknown) {
      const isAbort = error instanceof DOMException && error.name === 'AbortError';
      if (!isAbort) {
        const errorMsg = error instanceof Error ? error.message : t('somethingWrong');
        toast(errorMsg, 'error');
        setMessages((prev) => [
          ...prev,
          { id: crypto.randomUUID(), role: 'assistant', content: errorMsg },
        ]);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const renderAssistantMessage = (msg: Message) => {
    // If structured data is available, render it with the structured UI
    if (msg.structured) {
      const data = msg.structured as unknown;
      if (isBlockedResponse(data as ChatResponseNormal | ChatResponseBlocked)) {
        return <StructuredBlockedResponse data={data as ChatResponseBlocked & { validationWarnings?: string[] }} />;
      }
      if (isNormalResponse(data as ChatResponseNormal | ChatResponseBlocked)) {
        return <StructuredNormalResponse data={data as ChatResponseNormal} />;
      }
    }
    // Fallback: render as markdown (legacy messages)
    return <Markdown>{msg.content}</Markdown>;
  };

  return (
    <FeatureErrorBoundary title={t('title')}>
    <div className="flex flex-col h-full max-w-5xl mx-auto p-4 md:p-8">
      {/* ─── Header ─── */}
      <div className="mb-4 shrink-0">
        <CarvedHeader
          title={t('title')}
          subtitle={t('subtitle')}
          actions={
            <button
              onClick={handleClearChat}
              disabled={messages.length <= 1 || isLoading || isAuditing}
              className="flex items-center gap-2 text-sm text-sepia-600 hover:text-wax-500 hover:bg-sepia-300/20 px-3 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:hover:text-sepia-600 disabled:hover:bg-transparent"
              aria-label={t('clearAria')}
            >
              <Trash2 size={16} />
              {t('clear')}
            </button>
          }
        />
      </div>

      {/* ─── Messages ─── */}
      <div className="flex-1 overflow-y-auto space-y-5 pr-2 pb-4 scrollbar-thin">
        {hiddenCount > 0 && (
          <div className="flex justify-center pt-2">
            <button
              onClick={handleLoadEarlier}
              className="inline-flex items-center gap-2 text-xs font-medium text-sepia-600 hover:text-sepia-800 bg-parchment-200 hover:bg-parchment-300 border border-sepia-300/50 hover:border-brass-400/40 rounded-full px-4 py-2 transition active:scale-95"
              aria-label={t('loadEarlierAria', { count: Math.min(MESSAGE_WINDOW_STEP, hiddenCount) })}
            >
              <ChevronUp size={14} />
              {t('loadEarlier', { count: hiddenCount })}
            </button>
          </div>
        )}
        <AnimatePresence initial={false}>
          {windowedMessages.map((msg) => (
            <motion.div
              key={msg.id}
              {...passedNote(msg.role === 'user' ? 1 : -1)}
              className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
            >
              {/* Avatar */}
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 border-2 shadow-sm ${
                  msg.role === 'user'
                    ? 'bg-forest-700 border-forest-800'
                    : 'bg-parchment-200 border-brass-400/40'
                }`}
              >
                {msg.role === 'user'
                  ? <User size={16} className="text-cream-50" />
                  : <Feather size={16} className="text-brass-600" />
                }
              </div>

              {/* Bubble */}
              {msg.role === 'user' ? (
                <div className="max-w-[80%] rounded-xl rounded-tr-sm px-5 py-3 bg-forest-700 text-cream-50 border-2 border-forest-800 shadow-sm">
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                </div>
              ) : (
                <ParchmentCard variant="default" padding="none" className="max-w-[80%] rounded-tl-sm overflow-hidden">
                  {msg.isBlockedMode && (
                    <div className="flex items-center gap-2 px-5 py-2.5 bg-brass-500/10 border-b border-brass-400/30">
                      <LockKeyhole size={13} className="text-brass-600" />
                      <span className="text-xs font-bold uppercase tracking-wider text-brass-700">{t('blockedMode')}</span>
                    </div>
                  )}
                  <div className="px-5 py-4 prose prose-sepia prose-sm max-w-none font-sans leading-relaxed whitespace-pre-wrap">
                    {renderAssistantMessage(msg)}
                  </div>
                </ParchmentCard>
              )}
            </motion.div>
          ))}

          {/* Loading indicator */}
          {isLoading && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={springs.gentle}
              className="flex gap-3"
            >
              <div className="w-9 h-9 rounded-full bg-parchment-200 border-2 border-brass-400/40 flex items-center justify-center shrink-0 shadow-sm">
                <Feather size={16} className="text-brass-600" />
              </div>
              <ParchmentCard variant="default" padding="sm" className="flex items-center gap-3">
                <InkDotsLoader />
                <span className="text-sepia-600 text-sm font-medium italic">
                  {t('consulting')}
                </span>
              </ParchmentCard>
            </motion.div>
          )}
        </AnimatePresence>
        <div ref={messagesEndRef} />
      </div>

      {/* ─── Input Area ─── */}
      <div className="shrink-0 pt-4">
        <DecorativeDivider variant="brass-rule" className="mb-4" />

        {/* Audit Results Panel */}
        <AnimatePresence>
          {pendingAudit && (
            <motion.div {...fadeUp} exit={{ opacity: 0, y: 12 }}>
              <ParchmentCard variant="aged" padding="none" className="mb-4">
                {/* Audit header */}
                <div className="flex items-center justify-between px-5 pt-5 pb-3">
                  <h3 className="flex items-center gap-2 text-lg font-serif font-bold text-sepia-900">
                    <ShieldAlert size={20} className="text-brass-600" />
                    {t('continuityAudit')}
                  </h3>
                  <button
                    onClick={() => setPendingAudit(null)}
                    className="p-1.5 rounded-lg text-sepia-600 hover:text-sepia-700 hover:bg-sepia-300/20 transition-colors"
                    aria-label={t('dismissAudit')}
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="px-5 pb-5 space-y-5 max-h-[40vh] overflow-y-auto">
                  {/* Status */}
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-sepia-700 uppercase tracking-wider font-medium">{t('statusLabel')}</span>
                    <AuditStatusBadge status={pendingAudit.result.status} />
                  </div>

                  {/* Risks */}
                  {pendingAudit.result.risks && pendingAudit.result.risks.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="text-xs font-semibold text-sepia-700 uppercase tracking-wider">{t('risksFound')}</h4>
                      {pendingAudit.result.risks.map((risk, idx) => (
                        <ParchmentCard key={idx} variant="inset" padding="sm">
                          <div className="flex items-start gap-3">
                            <RiskBadge level={risk.level} />
                            <div className="flex-1 min-w-0">
                              <p className="text-sepia-800 text-sm leading-relaxed">{risk.description}</p>
                              {risk.affectedElements && risk.affectedElements.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                  {risk.affectedElements.map((el, i) => (
                                    <span key={i} className="text-[10px] bg-parchment-300/60 text-sepia-700 px-2 py-0.5 rounded-full border border-sepia-300/30 font-medium">
                                      {el}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </ParchmentCard>
                      ))}
                    </div>
                  )}

                  {/* Corrections */}
                  {pendingAudit.result.suggestedCorrections && pendingAudit.result.suggestedCorrections.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-semibold text-sepia-700 uppercase tracking-wider">{t('suggestedCorrections')}</h4>
                      <ul className="list-none text-sm text-sepia-700 space-y-1.5">
                        {pendingAudit.result.suggestedCorrections.map((corr, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <span className="w-1 h-1 rounded-full bg-brass-500/60 mt-2 shrink-0" />
                            {corr}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Safe Version */}
                  {pendingAudit.result.safeVersion && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-semibold text-sepia-700 uppercase tracking-wider">{t('safeVersion')}</h4>
                      <ParchmentCard variant="inset" padding="sm">
                        <p className="text-sm text-sepia-700 italic leading-relaxed">{pendingAudit.result.safeVersion}</p>
                      </ParchmentCard>
                    </div>
                  )}
                </div>

                {/* Audit actions */}
                <div className="px-5 pb-4">
                  <DecorativeDivider variant="section" className="mb-4" />
                  <div className="flex items-center justify-end gap-3">
                    <BrassButton
                      size="sm"
                      icon={<BookOpen size={14} />}
                      onClick={() => {
                        setInput(pendingAudit.result.safeVersion || pendingAudit.request);
                        setPendingAudit(null);
                      }}
                    >
                      {t('useSafeVersion')}
                    </BrassButton>
                    <InkStampButton
                      variant="danger"
                      size="sm"
                      icon={<AlertTriangle size={14} />}
                      onClick={() => {
                        const req = pendingAudit.request;
                        setPendingAudit(null);
                        handleSend(req);
                      }}
                    >
                      {t('proceedAnyway')}
                    </InkStampButton>
                  </div>
                </div>
              </ParchmentCard>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Quick prompts */}
        <div className="flex gap-2 mb-3">
          <button
            onClick={() => handleSend(t('quickBlocked'))}
            disabled={isLoading || isAuditing || pendingAudit !== null}
            className="text-xs font-medium bg-parchment-200 hover:bg-parchment-300 text-sepia-700 px-3 py-1.5 rounded-full transition border border-sepia-300/50 disabled:opacity-40 hover:border-brass-400/40 active:scale-95"
          >
            &quot;{t('quickBlocked')}&quot;
          </button>
          <button
            onClick={() => handleSend(t('quickContinue'))}
            disabled={isLoading || isAuditing || pendingAudit !== null}
            className="text-xs font-medium bg-parchment-200 hover:bg-parchment-300 text-sepia-700 px-3 py-1.5 rounded-full transition border border-sepia-300/50 disabled:opacity-40 hover:border-brass-400/40 active:scale-95"
          >
            &quot;{t('quickContinue')}&quot;
          </button>
        </div>

        {/* Textarea + action buttons */}
        <ParchmentCard variant="default" padding="none" className="relative">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={t('placeholder')}
            maxLength={5000}
            className="w-full bg-transparent pl-5 pr-24 py-4 text-sepia-900 placeholder-sepia-500 focus:outline-none resize-none h-24 text-sm leading-relaxed"
          />
          <div className="absolute right-3 bottom-3 flex items-center gap-2">
            <button
              onClick={handleAudit}
              disabled={!input.trim() || isLoading || isAuditing || pendingAudit !== null}
              className="p-2.5 rounded-lg text-brass-600 bg-parchment-200 hover:bg-brass-500/15 border border-brass-400/30 disabled:opacity-40 disabled:hover:bg-parchment-200 transition active:scale-95"
              aria-label={t('auditAria')}
            >
              {isAuditing ? <Loader2 size={18} className="animate-spin" /> : <ShieldAlert size={18} />}
            </button>
            {/* M23: the send button dips like a quill into the inkwell */}
            <motion.button
              whileTap={{ y: 3, rotate: 6, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 500, damping: 20 }}
              onClick={() => handleSend()}
              disabled={!input.trim() || isLoading || isAuditing || pendingAudit !== null}
              className="p-2.5 rounded-lg bg-forest-700 text-cream-50 border-2 border-forest-800 hover:bg-forest-600 disabled:opacity-40 disabled:hover:bg-forest-700 transition shadow-sm"
              aria-label={t('sendAria')}
            >
              <Send size={18} />
            </motion.button>
          </div>
        </ParchmentCard>
      </div>
    </div>
    </FeatureErrorBoundary>
  );
}
