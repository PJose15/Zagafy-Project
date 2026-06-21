'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useProfile } from '@/hooks/use-profile';

/** Compact avatar + name in the sidebar; links to the profile settings. */
export function ProfileBadge({ onNavigate }: { onNavigate?: () => void }) {
  const { profile } = useProfile();
  const t = useTranslations('profile');

  return (
    <Link
      href="/settings"
      onClick={onNavigate}
      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-mahogany-800/60 transition-colors mb-2"
      aria-label={t('badgeAria', { name: profile.displayName })}
    >
      <span
        className="w-7 h-7 rounded-full flex items-center justify-center text-sm shrink-0"
        style={{ backgroundColor: profile.avatarColor }}
        aria-hidden="true"
      >
        {profile.avatarEmoji}
      </span>
      <span className="flex-1 min-w-0 truncate text-sm text-cream-100">{profile.displayName}</span>
    </Link>
  );
}
