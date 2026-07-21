'use client';

import { useState, useRef, useCallback, KeyboardEvent } from 'react';
import { motion } from 'motion/react';
import { Send } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { BrassButton } from '@/components/antiquarian';

interface ChatInputProps {
  onSend: (message: string) => void;
  isLoading: boolean;
  /** True while the reply is still streaming — sending then would abort the
      stream and bake a partial reply into history, so the composer stays shut. */
  isStreaming?: boolean;
}

export function ChatInput({ onSend, isLoading, isStreaming = false }: ChatInputProps) {
  const t = useTranslations('characterChat');
  const tCommon = useTranslations('common');
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const busy = isLoading || isStreaming;

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || busy) return;
    onSend(trimmed);
    setValue('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [value, busy, onSend]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const handleInput = useCallback(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 160) + 'px';
    }
  }, []);

  return (
    <div className="border-t border-sepia-300/30 bg-parchment-200/60">
    <div className="flex gap-2 items-end p-3 pb-1.5">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => { setValue(e.target.value); handleInput(); }}
        onKeyDown={handleKeyDown}
        disabled={busy}
        placeholder={busy ? t('inputWaiting') : t('inputPlaceholder')}
        rows={1}
        className="flex-1 resize-none bg-parchment-50 border border-sepia-300/60 rounded-lg px-3 py-2 text-sm text-sepia-900 placeholder:text-sepia-600 focus:outline-none focus:ring-2 focus:ring-brass-400/40 focus:border-brass-500/60 disabled:opacity-50"
      />
      {/* M23: the send button dips like a quill into the inkwell */}
      <motion.div whileTap={{ y: 3, rotate: 6 }} transition={{ type: 'spring', stiffness: 500, damping: 20 }} className="flex-shrink-0">
        <BrassButton
          onClick={handleSend}
          disabled={busy || !value.trim()}
          aria-label={t('sendAria')}
        >
          <Send size={16} aria-hidden="true" />
        </BrassButton>
      </motion.div>
    </div>
    {/* A5: quiet keyboard hint for the composer */}
    <p aria-hidden="true" className="px-3 pb-2 text-right font-mono text-[10px] text-sepia-600">
      ↵ {tCommon('kbdSend')} · ⇧↵ {tCommon('kbdNewline')}
    </p>
    </div>
  );
}
