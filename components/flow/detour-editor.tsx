'use client';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { Timer, Check } from 'lucide-react';
import type { DetourSession, DetourType } from '@/lib/scenery-change/types';

interface DetourEditorProps {
  detour: DetourSession;
  onEnd: (content: string) => void;
}

/** Which translated default fills the prompt slot when the story had no data. */
const DEFAULT_PARAM_KEY: Record<DetourType, string> = {
  dialogue_sprint: 'protagonist',
  alternate_pov: 'sideCharacter',
  sensory_snapshot: 'currentScene',
  villains_diary: 'genre',
  flash_forward: 'protagonist',
  character_interview: 'mainCharacter',
};

export function DetourEditor({ detour, onEnd }: DetourEditorProps) {
  const t = useTranslations('flow.detour');
  const tCatalog = useTranslations('flow.detourCatalog');
  const [content, setContent] = useState(detour.content || '');
  const [elapsed, setElapsed] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // i18n: sessions store the template type + raw param; translate the prompt
  // at render. Legacy sessions (no promptParam field) show their stored
  // English prompt.
  let promptText = detour.prompt;
  let titleText = detour.prompt.split('.')[0];
  if (detour.promptParam !== undefined && DEFAULT_PARAM_KEY[detour.type]) {
    const param =
      detour.promptParam ?? tCatalog(`defaults.${DEFAULT_PARAM_KEY[detour.type]}`);
    promptText = tCatalog(`${detour.type}.prompt`, { param });
    titleText = tCatalog(`${detour.type}.title`);
  }

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed(prev => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // A full-screen takeover should honour Escape — same outcome as "Done"
  // (work is passed to onEnd, never discarded). The modal-hygiene hook isn't
  // used here to keep this overlay's focus handling minimal.
  const onEndRef = useRef(onEnd);
  const contentRef = useRef(content);
  useEffect(() => { onEndRef.current = onEnd; }, [onEnd]);
  useEffect(() => { contentRef.current = content; }, [content]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onEndRef.current(contentRef.current);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  const wordCount = content.trim().split(/\s+/).filter(Boolean).length;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[160] bg-parchment-100 flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label={titleText}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-sepia-300/30">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-serif font-semibold text-brass-600">{titleText}</h2>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-sepia-600">
            <Timer size={14} />
            <span className="text-xs font-mono">{minutes}:{seconds.toString().padStart(2, '0')}</span>
          </div>
          <span className="text-xs text-sepia-600">{t('words', { count: wordCount })}</span>
          <button
            onClick={() => onEnd(content)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-forest-700 text-cream-50 hover:bg-forest-600 transition-colors"
          >
            <Check size={14} /> {t('done')}
          </button>
        </div>
      </div>

      {/* Prompt display */}
      <div className="px-6 py-3 bg-brass-500/5 border-b border-brass-500/10">
        <p className="text-sm text-brass-700 italic">{promptText}</p>
      </div>

      {/* Editor */}
      <div className="flex-1 flex flex-col items-center px-4 py-8">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={t('placeholder')}
          className="w-full max-w-3xl flex-1 bg-transparent text-sepia-900 text-lg leading-relaxed font-serif placeholder-sepia-600 focus:outline-none resize-none"
        />
      </div>
    </motion.div>
  );
}
