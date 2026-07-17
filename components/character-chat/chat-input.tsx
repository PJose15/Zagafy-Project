'use client';

import { useState, useRef, useCallback, KeyboardEvent } from 'react';
import { motion } from 'motion/react';
import { Send } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { BrassButton } from '@/components/antiquarian';

interface ChatInputProps {
  onSend: (message: string) => void;
  isLoading: boolean;
}

export function ChatInput({ onSend, isLoading }: ChatInputProps) {
  const t = useTranslations('characterChat');
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || isLoading) return;
    onSend(trimmed);
    setValue('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [value, isLoading, onSend]);

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
    <div className="flex gap-2 items-end p-3 border-t border-sepia-300/30 bg-parchment-200/60">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => { setValue(e.target.value); handleInput(); }}
        onKeyDown={handleKeyDown}
        disabled={isLoading}
        placeholder={isLoading ? t('inputWaiting') : t('inputPlaceholder')}
        rows={1}
        className="flex-1 resize-none bg-parchment-50 border border-sepia-300/60 rounded-lg px-3 py-2 text-sm text-sepia-900 placeholder:text-sepia-500 focus:outline-none focus:ring-2 focus:ring-brass-400/40 focus:border-brass-500/60 disabled:opacity-50"
      />
      {/* M23: the send button dips like a quill into the inkwell */}
      <motion.div whileTap={{ y: 3, rotate: 6 }} transition={{ type: 'spring', stiffness: 500, damping: 20 }} className="flex-shrink-0">
        <BrassButton
          onClick={handleSend}
          disabled={isLoading || !value.trim()}
          aria-label={t('sendAria')}
        >
          <Send size={16} aria-hidden="true" />
        </BrassButton>
      </motion.div>
    </div>
  );
}
