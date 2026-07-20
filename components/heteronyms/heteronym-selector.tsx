'use client';

import { useState, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown } from 'lucide-react';
import { AvatarCircle } from './avatar-circle';
import type { Heteronym } from '@/lib/types/heteronym';

interface HeteronymSelectorProps {
  heteronyms: Heteronym[];
  activeId: string | null;
  onSelect: (id: string) => void;
}

export function HeteronymSelector({ heteronyms, activeId, onSelect }: HeteronymSelectorProps) {
  const t = useTranslations('heteronyms');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const active = heteronyms.find(h => h.id === activeId) || heteronyms[0];

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        // Z19: hand focus back to the trigger so keyboard users aren't lost.
        triggerRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open]);

  if (!active) return null;

  return (
    <div ref={ref} className="relative">
      <button
        ref={triggerRef}
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-parchment-200 transition-colors"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('selector.selectVoice')}
      >
        <AvatarCircle color={active.avatarColor} emoji={active.avatarEmoji} size={24} />
        <span className="text-xs text-sepia-600 max-w-[100px] truncate">{active.name}</span>
        <ChevronDown size={12} className={`text-sepia-600 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={t('selector.voicesLabel')}
          className="absolute top-full left-0 mt-1 bg-parchment-100 border border-sepia-300/40 rounded-xl shadow-xl min-w-[200px] py-1 z-20"
        >
          {heteronyms.map((h) => (
            <button
              key={h.id}
              role="option"
              aria-selected={h.id === activeId}
              onClick={() => {
                onSelect(h.id);
                setOpen(false);
              }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-parchment-200 transition-colors ${
                h.id === activeId ? 'bg-parchment-200/50' : ''
              }`}
            >
              <AvatarCircle color={h.avatarColor} emoji={h.avatarEmoji} size={28} />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-sepia-800 truncate">{h.name}</p>
                {h.styleNote && (
                  <p className="text-[11px] text-sepia-600 truncate">{h.styleNote}</p>
                )}
              </div>
              {h.id === activeId && (
                <span className="text-[10px] text-brass-500 shrink-0">{t('active')}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
