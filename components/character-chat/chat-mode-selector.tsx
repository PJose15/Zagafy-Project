'use client';

import { BookOpen, Theater, Swords } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import type { ChatMode } from '@/lib/types/character-chat';

const modes: { value: ChatMode; icon: typeof BookOpen }[] = [
  { value: 'exploration', icon: BookOpen },
  { value: 'scene', icon: Theater },
  { value: 'confrontation', icon: Swords },
];

interface ChatModeSelectorProps {
  activeMode: ChatMode;
  onModeChange: (mode: ChatMode) => void;
}

export function ChatModeSelector({ activeMode, onModeChange }: ChatModeSelectorProps) {
  const t = useTranslations('characterChat');
  return (
    <div className="flex gap-1 p-1 bg-parchment-200 rounded-lg border border-sepia-300/40">
      {modes.map(({ value, icon: Icon }) => {
        const isActive = activeMode === value;
        return (
          <motion.button
            key={value}
            onClick={() => onModeChange(value)}
            whileTap={{ scale: 0.97 }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              isActive
                ? 'bg-forest-700 text-cream-50'
                : 'text-sepia-700 hover:bg-parchment-300/60 hover:text-sepia-900'
            }`}
          >
            <Icon size={14} />
            {t(`modes.${value}`)}
          </motion.button>
        );
      })}
    </div>
  );
}
