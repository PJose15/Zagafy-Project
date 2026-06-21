'use client';

import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import type { BlockType } from '@/lib/session';
import { Eye, Target, Compass, BatteryLow } from 'lucide-react';

export interface BlockCardData {
  type: Exclude<BlockType, null>;
  icon: typeof Eye;
  accent: string;
  bgAccent: string;
}

export const blockCards: BlockCardData[] = [
  {
    type: 'fear',
    icon: Eye,
    accent: 'text-wax-600',
    bgAccent: 'border-wax-600/30 hover:border-wax-600/60 hover:bg-wax-600/5',
  },
  {
    type: 'perfectionism',
    icon: Target,
    accent: 'text-brass-400',
    bgAccent: 'border-brass-500/30 hover:border-brass-500/60 hover:bg-brass-500/5',
  },
  {
    type: 'direction',
    icon: Compass,
    accent: 'text-sepia-600',
    bgAccent: 'border-sepia-500/30 hover:border-sepia-500/60 hover:bg-sepia-500/5',
  },
  {
    type: 'exhaustion',
    icon: BatteryLow,
    accent: 'text-forest-400',
    bgAccent: 'border-forest-500/30 hover:border-forest-500/60 hover:bg-forest-500/5',
  },
];

interface BlockCardProps {
  card: BlockCardData;
  index: number;
  onSelect: (type: Exclude<BlockType, null>) => void;
}

export function BlockCard({ card, index, onSelect }: BlockCardProps) {
  const Icon = card.icon;
  const t = useTranslations('diagnostic');
  const label = t(`blocks.${card.type}Label`);
  const description = t(`blocks.${card.type}Desc`);

  return (
    <motion.button
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      onClick={() => onSelect(card.type)}
      className={`w-full text-left bg-parchment-100/50 border rounded-xl p-6 transition-colors cursor-pointer ${card.bgAccent}`}
      aria-label={t('selectAria', { label, description })}
    >
      <div className="flex items-start gap-4">
        <div className={`p-2 rounded-xl bg-parchment-200 ${card.accent}`}>
          <Icon size={24} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-sepia-800 text-lg">{label}</h3>
          <p className="text-sm text-sepia-600 mt-1 italic">&ldquo;{description}&rdquo;</p>
        </div>
      </div>
    </motion.button>
  );
}
