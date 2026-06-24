'use client';

import { BrainCircuit } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

interface BrainToggleButtonProps {
  unresolvedCount: number;
}

export function BrainToggleButton({ unresolvedCount }: BrainToggleButtonProps) {
  const t = useTranslations('storyBrain');
  return (
    <Link
      href="/story-brain"
      className="relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-sepia-600 hover:text-sepia-800 hover:bg-parchment-200 transition-colors"
      aria-label={unresolvedCount > 0 ? t('toggle.ariaUnresolved', { count: unresolvedCount }) : t('toggle.aria')}
    >
      <BrainCircuit size={16} />
      <span>{t('toggle.label')}</span>
      {unresolvedCount > 0 && (
        <span className="absolute -top-1 -right-1 bg-wax-500 text-white text-[9px] rounded-full w-4 h-4 flex items-center justify-center font-mono">
          {unresolvedCount > 9 ? '9+' : unresolvedCount}
        </span>
      )}
    </Link>
  );
}
