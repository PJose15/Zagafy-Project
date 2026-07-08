'use client';

import { useState, useRef, useCallback, KeyboardEvent } from 'react';
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
    <div className="flex gap-2 items-end p-3 border-t border-mahogany-700/30 bg-mahogany-900/50">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => { setValue(e.target.value); handleInput(); }}
        onKeyDown={handleKeyDown}
        disabled={isLoading}
        placeholder={isLoading ? t('inputWaiting') : t('inputPlaceholder')}
        rows={1}
        className="flex-1 resize-none bg-mahogany-800/50 border border-mahogany-700/30 rounded-lg px-3 py-2 text-sm text-cream-100 placeholder:text-cream-400/40 focus:outline-none focus:ring-1 focus:ring-brass-500/50 disabled:opacity-50"
      />
      <BrassButton
        onClick={handleSend}
        disabled={isLoading || !value.trim()}
        className="flex-shrink-0"
      >
        <Send size={16} />
      </BrassButton>
    </div>
  );
}
