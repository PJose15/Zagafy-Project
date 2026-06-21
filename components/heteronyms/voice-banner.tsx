'use client';

import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { AvatarCircle } from './avatar-circle';
import type { Heteronym } from '@/lib/types/heteronym';

interface VoiceBannerProps {
  guestHeteronym: Heteronym;
  onClear: () => void;
}

export function VoiceBanner({ guestHeteronym, onClear }: VoiceBannerProps) {
  const t = useTranslations('heteronyms.banner');
  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 border-b border-amber-500/20"
      role="status"
      aria-label={t('writingAsAria', { name: guestHeteronym.name })}
    >
      <AvatarCircle color={guestHeteronym.avatarColor} emoji={guestHeteronym.avatarEmoji} size={20} />
      <span className="text-xs text-amber-300/80 flex-1 truncate">
        {t.rich('writingAs', { name: guestHeteronym.name, b: (chunks) => <strong className="font-medium">{chunks}</strong> })}
      </span>
      <button
        onClick={onClear}
        className="p-0.5 text-amber-400/60 hover:text-amber-300 rounded transition-colors"
        aria-label={t('stopGuest')}
      >
        <X size={14} />
      </button>
    </div>
  );
}
